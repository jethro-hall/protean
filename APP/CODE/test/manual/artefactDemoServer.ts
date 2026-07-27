/**
 * BROWSER-VERIFICATION HARNESS — not part of the product.
 *
 * Boots the REAL engine (server → watcher → artefact parser → SSE) with a
 * scripted AgentCore at the provider boundary, so the Phase 3 GUI path can be
 * click-verified in a real browser while live model access is unavailable.
 * The live-model acceptance run stays pending — this harness never replaces it.
 *
 * Run: npx tsx test/manual/artefactDemoServer.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AgentCore } from '../../src/agent/AgentCore.js';
import { loadConfig } from '../../src/config/loadConfig.js';
import type { LlmGateway } from '../../src/gateway/LlmGateway.js';
import { createLogger } from '../../src/logging/logger.js';
import { createMemoryCacheStore } from '../../src/watcher/cache.js';
import { createMemorySessionStore } from '../../src/watcher/sessionStore.js';
import { startServer, type AppDeps } from '../../src/server.js';

const CHUNK_DELAY_MS = 60;

function demoHtml(userInput: string): string {
  const accent = /red/i.test(userInput) ? '#c0392b' : '#4c8dd6';
  return [
    '<!doctype html><html><head><style>',
    `body{font-family:sans-serif;padding:2rem;color:#1e2a3a} h1{color:${accent}}`,
    'table{border-collapse:collapse;margin-top:1rem} td,th{border:1px solid #ccc;padding:6px 12px}',
    '</style></head><body>',
    '<h1>Quarterly snapshot</h1>',
    `<p>Built from your request: \u201c${userInput}\u201d</p>`,
    '<table><tr><th>Metric</th><th>Value</th></tr>',
    '<tr><td>Revenue</td><td>$1.24M</td></tr>',
    '<tr><td>Gross margin</td><td>38%</td></tr>',
    '</table></body></html>',
  ].join('\n');
}

/** Streams chat text, then an HTML artefact in small chunks, then closing chat. */
const scriptedAgent: AgentCore = {
  name: 'scripted-demo',
  async *runTurn(turn) {
    const userInput = turn.messages.at(-1)?.content ?? '';
    yield { type: 'text', text: 'Building your page now \u2014 watch the preview pane. ' };
    await sleep(CHUNK_DELAY_MS);
    yield { type: 'text', text: '<protean:artefact type="html" title="Quarterly snapshot">' };
    const html = demoHtml(userInput);
    for (let at = 0; at < html.length; at += 48) {
      await sleep(CHUNK_DELAY_MS);
      yield { type: 'text', text: html.slice(at, at + 48) };
    }
    yield { type: 'text', text: '</protean:artefact>' };
    await sleep(CHUNK_DELAY_MS);
    yield { type: 'text', text: ' Done \u2014 the page is in the preview pane.' };
    yield {
      type: 'done',
      model: 'scripted-demo-model',
      usage: { inputTokens: 10, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
      providerDurationMs: 500,
    };
  },
};

const unusedGateway: LlmGateway = {
  provider: 'scripted-demo',
  async *streamTurn() {
    yield { type: 'error', message: 'gateway is not used by the demo harness' };
  },
};

const config = loadConfig();
const dataDir = mkdtempSync(join(tmpdir(), 'protean-demo-'));
const deps: AppDeps = {
  config: {
    ...config,
    models: { fast: 'scripted-demo-model', strong: 'scripted-demo-model' },
    paths: {
      ...config.paths,
      dataDir,
      promptHistoryDir: join(dataDir, 'prompt-history'),
      tokenTelemetryDir: join(dataDir, 'token-telemetry'),
      sessionsDir: join(dataDir, 'sessions'),
      artefactsDir: join(dataDir, 'artefacts'),
    },
  },
  logger: createLogger('info'),
  cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
  sessions: createMemorySessionStore(),
  agent: scriptedAgent,
  gateway: unusedGateway,
};

startServer(deps);
