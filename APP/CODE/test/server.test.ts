import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgentCore } from '../src/agent/AgentCore.js';
import { loadConfig } from '../src/config/loadConfig.js';
import { createLogger } from '../src/logging/logger.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';
import { createMemoryCacheStore } from '../src/watcher/cache.js';
import { createMemorySessionStore } from '../src/watcher/sessionStore.js';
import { saveProvider } from '../src/config/runtimeSettingsStore.js';
import { startServer, type AppDeps } from '../src/server.js';
import { buildScannedLikePdf, buildTestPdf } from './helpers/buildTestPdf.js';

const fakeAgent: AgentCore = {
  name: 'fake',
  async *runTurn(turn) {
    const wantsArtefact = turn.messages.at(-1)?.content.includes('build a page') ?? false;
    if (wantsArtefact) {
      // exercise the wire protocol, including a tag split across chunks
      yield { type: 'text' as const, text: 'Here it is: <protean:arte' };
      yield { type: 'text' as const, text: 'fact type="html" title="Test page"><h1>Hi</h1>' };
      yield { type: 'text' as const, text: '</protean:artefact> done.' };
    } else {
      yield { type: 'text' as const, text: 'hello ' };
      yield { type: 'text' as const, text: 'from fake' };
    }
    yield {
      type: 'done' as const,
      model: 'test-model',
      usage: { inputTokens: 3, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
      providerDurationMs: 1,
    };
  },
};

// Authoring routes (Phase P) call deps.gateway directly (no agent loop), so this
// fake pattern-matches by system prompt to serve those calls realistically while
// preserving the existing guarantee that ordinary chat turns never reach it
// (those go through fakeAgent instead) -- any other call still errors loudly.
const fakeGateway: LlmGateway = {
  provider: 'fake',
  async *streamTurn(request) {
    const systemPrompt = typeof request.systemPrompt === 'string' ? request.systemPrompt : '';
    if (systemPrompt.includes('propose a concise heading')) {
      const userText = request.messages[0]?.content ?? '';
      const chunkIdMatch = /chunkId: ([^)]+)\)/.exec(userText);
      const chunkId = chunkIdMatch?.[1] ?? 'unknown';
      yield {
        type: 'text' as const,
        text: JSON.stringify({
          proposals: [{ chunkId, heading: 'Fake Proposed Heading', summary: 'Fake proposed summary.' }],
        }),
      };
      yield {
        type: 'done' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: 0,
        providerDurationMs: 1,
      };
      return;
    }
    if (systemPrompt.includes('propose a domain-pack draft')) {
      yield {
        type: 'text' as const,
        text: JSON.stringify({
          displayName: 'Fake Draft Pack',
          systemPrompt: 'You are a fake draft assistant.',
          vocabulary: { Fake: 'A fake term' },
        }),
      };
      yield {
        type: 'done' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: 0,
        providerDurationMs: 1,
      };
      return;
    }
    yield { type: 'error' as const, message: 'gateway should not be called in these tests' };
  },
};

let server: ReturnType<typeof startServer>;
let baseUrl: string;
let dataDir: string;

beforeAll(async () => {
  const config = loadConfig();
  dataDir = mkdtempSync(join(tmpdir(), 'protean-server-test-'));
  const deps: AppDeps = {
    config: {
      ...config,
      port: 0,
      models: { fast: 'test-model', strong: 'test-model' },
      paths: {
        ...config.paths,
        dataDir,
        promptHistoryDir: join(dataDir, 'prompt-history'),
        tokenTelemetryDir: join(dataDir, 'token-telemetry'),
        artefactsDir: join(dataDir, 'artefacts'),
        uploadsDir: join(dataDir, 'uploads'),
        runtimeConfigDir: join(dataDir, 'runtime-config'),
        embeddingTelemetryDir: join(dataDir, 'embedding-telemetry'),
      },
      // Hermetic test suite: no real network/DB calls. Phase N/M's own dedicated
      // test files (voyageAdapter.test.ts, pgvectorAdapter.test.ts) cover the
      // real integration paths; live proof of the full save-collection pipeline
      // is done via a separate script against the real running engine.
      grounding: { pg: undefined, voyageApiKey: undefined, embeddingModel: 'test-embedding-model' },
    },
    logger: createLogger('error', () => {}),
    cache: createMemoryCacheStore(60, 10),
    sessions: createMemorySessionStore(),
    agent: fakeAgent,
    gateway: fakeGateway,
  };
  server = startServer(deps);
  await new Promise<void>((resolve) => server.on('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('engine HTTP surface', () => {
  it('reports health', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('lists domain packs', async () => {
    const res = await fetch(`${baseUrl}/api/domains`);
    const body = (await res.json()) as { domains: Array<{ id: string }> };
    expect(body.domains.map((d) => d.id)).toContain('generic');
  });

  it('rejects an empty turn request with 400', async () => {
    const res = await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('streams a turn as SSE text events ending in done', async () => {
    const res = await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'say hello', sessionId: 'server-test-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const raw = await res.text();
    expect(raw).toContain('event: text');
    expect(raw).toContain('hello ');
    expect(raw).toContain('event: done');
    const doneLine = raw
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes('"type":"done"'));
    if (doneLine === undefined) throw new Error('no done event payload');
    const done = JSON.parse(doneLine.slice('data:'.length));
    expect(done.cacheHit).toBe(false);
    expect(done.timings.totalMs).toBeGreaterThan(0);
  });

  it('lists a real completed turn as a saved session summary, and fetches its full history', async () => {
    await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'a question worth remembering', sessionId: 'server-test-sessions-1' }),
    });

    const listRes = await fetch(`${baseUrl}/api/sessions`);
    expect(listRes.status).toBe(200);
    const { sessions } = (await listRes.json()) as {
      sessions: Array<{ id: string; title: string; turnCount: number; totalCostUsd: number }>;
    };
    const summary = sessions.find((s) => s.id === 'server-test-sessions-1');
    expect(summary).toBeDefined();
    expect(summary?.title).toBe('a question worth remembering');
    expect(summary?.turnCount).toBe(1);

    const getRes = await fetch(`${baseUrl}/api/sessions/server-test-sessions-1`);
    expect(getRes.status).toBe(200);
    const { messages } = (await getRes.json()) as { messages: Array<{ role: string; content: string }> };
    expect(messages[0]).toEqual({ role: 'user', content: 'a question worth remembering' });
    expect(messages[1]?.role).toBe('assistant');
  });

  it('returns 404 with a specific message for a session id with no saved history', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/never-existed`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('never-existed');
  });

  it('streams artefact events over SSE and reports the saved path', async () => {
    const res = await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'build a page for me', sessionId: 'server-test-artefact' }),
    });
    const raw = await res.text();
    expect(raw).toContain('event: artefact-start');
    expect(raw).toContain('event: artefact-delta');
    expect(raw).toContain('event: artefact-end');
    // chat text around the artefact still arrives as plain text events
    expect(raw).toContain('Here it is: ');
    // the artefact body must never leak into chat text events
    const textPayloads = raw
      .split('\n')
      .filter((line) => line.startsWith('data:') && line.includes('"type":"text"'));
    expect(textPayloads.some((line) => line.includes('<h1>'))).toBe(false);

    const endLine = raw
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes('"type":"artefact-end"'));
    if (endLine === undefined) throw new Error('no artefact-end payload');
    const end = JSON.parse(endLine.slice('data:'.length)) as {
      complete: boolean;
      savedPath: string | null;
    };
    expect(end.complete).toBe(true);
    if (end.savedPath === null) throw new Error('artefact was not saved');
    expect(readFileSync(end.savedPath, 'utf8')).toBe('<h1>Hi</h1>');
  });

  it('accepts an attachment, saves the upload, and emits a stage activity', async () => {
    const res = await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'summarise this file',
        sessionId: 'server-test-upload',
        attachments: [{ name: 'spec.json', mimeType: 'application/json', textContent: '{"nodes":[]}' }],
      }),
    });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).toContain('event: activity-start');
    expect(raw).toContain('spec.json');
    const uploadDir = join(dataDir, 'uploads', 'server-test-upload');
    const files = readdirSync(uploadDir);
    expect(files.some((name) => name.endsWith('spec.json'))).toBe(true);
  });

  it('rejects an oversized attachment with 400', async () => {
    const res = await fetch(`${baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'too big',
        attachments: [{ name: 'big.txt', mimeType: 'text/plain', textContent: 'x'.repeat(600 * 1024) }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('serves the identical prompt from cache on the second request', async () => {
    const headers = { 'Content-Type': 'application/json' };
    // different session, same assembled prompt (empty history both times)
    await fetch(`${baseUrl}/api/turn`, { method: 'POST', headers, body: JSON.stringify({ input: 'cache me', sessionId: 'a' }) });
    const second = await fetch(`${baseUrl}/api/turn`, { method: 'POST', headers, body: JSON.stringify({ input: 'cache me', sessionId: 'b' }) });
    const raw = await second.text();
    const doneLine = raw
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes('"type":"done"'));
    if (doneLine === undefined) throw new Error('no done event payload');
    expect(JSON.parse(doneLine.slice('data:'.length)).cacheHit).toBe(true);
  });

  it('saves, lists (redacted), and deletes a provider', async () => {
    const headers = { 'Content-Type': 'application/json' };
    const saveRes = await fetch(`${baseUrl}/api/settings/providers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: 'Route Test Provider', config: { type: 'anthropic', apiKey: 'sk-route-test-1234' } }),
    });
    expect(saveRes.status).toBe(200);
    const saved = (await saveRes.json()) as { provider: { id: string } };

    const listRes = await fetch(`${baseUrl}/api/settings/providers`);
    const listed = (await listRes.json()) as { providers: Array<{ id: string; secretRedacted: string }> };
    const found = listed.providers.find((p) => p.id === saved.provider.id);
    expect(found).toBeDefined();
    expect(found?.secretRedacted).toBe('***1234');
    expect(JSON.stringify(listed)).not.toContain('sk-route-test-1234');

    const deleteRes = await fetch(`${baseUrl}/api/settings/providers/${saved.provider.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
    const afterDelete = (await (await fetch(`${baseUrl}/api/settings/providers`)).json()) as {
      providers: Array<{ id: string }>;
    };
    expect(afterDelete.providers.some((p) => p.id === saved.provider.id)).toBe(false);
  });

  it('rejects an invalid provider config with a specific 400, not a bare crash', async () => {
    const res = await fetch(`${baseUrl}/api/settings/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Bad', config: { type: 'openai-compatible', baseUrl: 'not-a-url', apiKey: 'k' } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Invalid provider');
  });

  it('returns 404 with a specific message when testing an unknown saved provider id', async () => {
    const res = await fetch(`${baseUrl}/api/settings/providers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'does-not-exist' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('does-not-exist');
  });

  describe('quick model picker: providerId routes a turn to a custom provider', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('answers via the saved custom provider instead of the built-in gateway', async () => {
      const record = saveProvider(join(dataDir, 'runtime-config'), {
        label: 'Test Custom Provider',
        config: { type: 'anthropic', apiKey: 'sk-test-key' },
        model: 'claude-custom-test',
      });

      // Only intercept the outbound call to the vendor -- the test's own call
      // to the local test server must still go through the real fetch.
      const realFetch = globalThis.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (String(url).includes('api.anthropic.com')) {
            return new Response(
              JSON.stringify({ content: [{ type: 'text', text: 'answer from custom provider' }], usage: { input_tokens: 1, output_tokens: 1 } }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return realFetch(url, init);
        }),
      );

      const res = await fetch(`${baseUrl}/api/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'hello', sessionId: 'custom-provider-test', providerId: record.id }),
      });
      expect(res.status).toBe(200);
      const raw = await res.text();
      expect(raw).toContain('answer from custom provider');
      const doneLine = raw.split('\n').find((line) => line.startsWith('data:') && line.includes('"type":"done"'));
      if (doneLine === undefined) throw new Error('no done event payload');
      const done = JSON.parse(doneLine.slice('data:'.length)) as { model: string };
      expect(done.model).toBe('claude-custom-test');
    });

    it('rejects a turn referencing an unknown providerId with a specific error', async () => {
      const res = await fetch(`${baseUrl}/api/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'hello', sessionId: 'custom-provider-missing', providerId: 'does-not-exist' }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('does-not-exist');
    });
  });

  describe('POST /api/settings/knowledge/ingest (Phase O)', () => {
    it('extracts draft chunks from a real text-native PDF and never saves anything', async () => {
      const pdf = buildTestPdf([
        [
          { text: 'Eligibility', fontSize: 14 },
          { text: 'Entities must incur real notional deductions to qualify for the offset.' },
        ],
      ]);
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.pdf', base64Pdf: pdf.toString('base64') }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        message: string;
        chunks: Array<{ heading: string; sourceUrl: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.chunks.length).toBeGreaterThan(0);
      expect(body.chunks[0]?.heading).toBe('Eligibility');
      expect(body.chunks[0]?.sourceUrl).toBe('test.pdf#page=1');
      expect(body.message).toContain('draft chunk');
    });

    it('rejects a scanned/image-only PDF with ok:false and a specific reason, HTTP 200 not an error status', async () => {
      const pdf = buildScannedLikePdf(1);
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'scanned.pdf', base64Pdf: pdf.toString('base64') }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string; chunks: unknown[] };
      expect(body.ok).toBe(false);
      expect(body.message).toContain('scanned/image PDF');
      expect(body.chunks).toEqual([]);
    });

    it('rejects a request missing base64Pdf with a 400 and a specific error, not a bare "error"', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.pdf' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Invalid ingest request');
    });

    it('a garbage/invalid-base64 payload decodes to non-PDF bytes and gets a specific parse-failure reason, never a 500', async () => {
      // Node's Buffer.from(str, 'base64') never throws -- it silently decodes whatever
      // valid characters it finds. The resulting bytes aren't a real PDF, so extractPdfText's
      // own parse-failure path is what actually catches this, not base64 validation.
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'test.pdf', base64Pdf: 'not valid base64 !!! ###' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(false);
      expect(body.message).toContain('Could not parse this file as a PDF');
    });
  });

  describe('POST /api/settings/knowledge/ingest-url', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Intercepts only the outbound ingestion fetch -- the test's own call to the local server still uses the real fetch. */
    function stubOutboundFetch(response: Response): void {
      const realFetch = globalThis.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (requestUrl.startsWith(baseUrl)) return realFetch(input as string, init);
          return response;
        }),
      );
    }

    it('fetches a real PDF from a URL and extracts draft chunks, same shape as file-upload ingest', async () => {
      const pdf = buildTestPdf([
        [
          { text: 'Eligibility', fontSize: 14 },
          { text: 'Entities must incur real notional deductions to qualify for the offset, in full.' },
        ],
      ]);
      stubOutboundFetch(new Response(pdf, { status: 200, headers: { 'content-type': 'application/pdf' } }));

      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://8.8.8.8/act.pdf' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        message: string;
        chunks: Array<{ heading: string; sourceUrl: string; sourceTitle: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.chunks.length).toBeGreaterThan(0);
      expect(body.chunks[0]?.heading).toBe('Eligibility');
      expect(body.chunks[0]?.sourceUrl).toBe('https://8.8.8.8/act.pdf#page=1');
      expect(body.chunks[0]?.sourceTitle).toBe('https://8.8.8.8/act.pdf');
    });

    it('fetches HTML and auto-derives sourceTitle from <title> when none is given', async () => {
      const html =
        '<html><head><title>Criminal Code Act</title></head><body><p>Section 1: real clause text.</p></body></html>';
      stubOutboundFetch(new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));

      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://8.8.8.8/act.html' }),
      });
      const body = (await res.json()) as { ok: boolean; chunks: Array<{ sourceTitle: string }> };
      expect(body.ok).toBe(true);
      expect(body.chunks[0]?.sourceTitle).toBe('Criminal Code Act');
    });

    it('an explicit sourceTitle wins over the page\'s own <title>', async () => {
      const html = '<html><head><title>Ignored</title></head><body><p>Some real body text here.</p></body></html>';
      stubOutboundFetch(new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));

      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://8.8.8.8/act.html', sourceTitle: 'My Chosen Title' }),
      });
      const body = (await res.json()) as { ok: boolean; chunks: Array<{ sourceTitle: string }> };
      expect(body.chunks[0]?.sourceTitle).toBe('My Chosen Title');
    });

    it('refuses a private/loopback URL before ever fetching -- the SSRF guard, exercised through the real route', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1/internal' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(false);
      expect(body.message).toContain('not a fetchable public');
    });

    it('rejects a request whose url is not a valid URL with a 400, not a bare crash', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/ingest-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not a url' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Invalid ingest-url request');
    });
  });

  describe('POST /api/settings/knowledge/propose (Phase P)', () => {
    it('proposes heading/summary metadata paired with each real chunkId', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunks: [
            {
              id: 'chunk-a',
              heading: 'Extractive heading',
              text: 'Some source text.',
              sourceTitle: 'Doc',
              sourceUrl: 'doc.pdf#page=1',
              fetchedAt: '2026-08-02',
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        proposals: Array<{ chunkId: string; heading: string; summary: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.proposals).toEqual([
        { chunkId: 'chunk-a', heading: 'Fake Proposed Heading', summary: 'Fake proposed summary.' },
      ]);
    });

    it('rejects an empty chunks array with a 400', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunks: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/settings/knowledge/propose-pack (Phase P)', () => {
    it('proposes a validated pack draft from reviewed sections', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/propose-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentTitle: 'Test Doc',
          sections: [{ heading: 'A Section', summary: 'A summary.' }],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        draft: { displayName: string; systemPrompt: string; vocabulary: Record<string, string> };
      };
      expect(body.ok).toBe(true);
      expect(body.draft.displayName).toBe('Fake Draft Pack');
      expect(body.draft.vocabulary).toEqual({ Fake: 'A fake term' });
    });
  });

  describe('POST /api/settings/knowledge/save-collection (Phase P)', () => {
    it('saves a collection to the overlay, immediately visible via the knowledge-collections list', async () => {
      const collectionId = `save-test-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/settings/knowledge/save-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: collectionId,
          displayName: 'Save Test Collection',
          chunks: [
            {
              id: 'save-test-chunk',
              heading: 'Heading',
              text: 'Body text.',
              sourceTitle: 'Doc',
              sourceUrl: 'doc.pdf#page=1',
              fetchedAt: '2026-08-02',
            },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string; log: string[] };
      expect(body.ok).toBe(true);
      expect(body.message).toContain(collectionId);
      // No Postgres/Voyage configured in this hermetic test server -- honest, visible degrade.
      expect(body.log.some((line) => line.includes('No Postgres/VOYAGE_API_KEY configured'))).toBe(true);

      const listRes = await fetch(`${baseUrl}/api/settings/knowledge-collections`);
      const listBody = (await listRes.json()) as { collections: Array<{ id: string }> };
      expect(listBody.collections.map((c) => c.id)).toContain(collectionId);
    });

    it('rejects an invalid collection with a specific 400 error', async () => {
      const res = await fetch(`${baseUrl}/api/settings/knowledge/save-collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'x' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Invalid knowledge collection');
    });
  });
});
