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

const fakeGateway: LlmGateway = {
  provider: 'fake',
  async *streamTurn() {
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
      },
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
});
