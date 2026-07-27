import { mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentCore } from '../src/agent/AgentCore.js';
import { loadConfig } from '../src/config/loadConfig.js';
import { createLogger } from '../src/logging/logger.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';
import { createMemoryCacheStore } from '../src/watcher/cache.js';
import { createMemorySessionStore } from '../src/watcher/sessionStore.js';
import { startServer, type AppDeps } from '../src/server.js';

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

beforeAll(async () => {
  const config = loadConfig();
  const dataDir = mkdtempSync(join(tmpdir(), 'protean-server-test-'));
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
});
