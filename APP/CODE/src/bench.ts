/**
 * Phase 2 acceptance bench: measures the Watcher's DETERMINISTIC-path overhead
 * (assemble + budget + gate + cache-check + record) with a zero-latency fake
 * agent, so no provider time pollutes the number. ROADMAP requires < 50 ms.
 *
 * Usage: npx tsx src/bench.ts [--turns 200]
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentCore } from './agent/AgentCore.js';
import { loadDomainPack } from './config/domainPacks.js';
import { loadConfig } from './config/loadConfig.js';
import type { ChatMessage, TurnRequest } from './contracts/turn.js';
import { createLogger } from './logging/logger.js';
import { createMemoryCacheStore } from './watcher/cache.js';
import { runTurn, type TurnPipelineDeps } from './watcher/runTurn.js';

/** ROADMAP Phase 2: Watcher overhead on the deterministic path must be < 50 ms. */
const WATCHER_OVERHEAD_BUDGET_MS = 50;
const DEFAULT_BENCH_TURNS = 200;
const BENCH_HISTORY_MESSAGES = 40; // realistic long-chat assembly load

const zeroLatencyAgent: AgentCore = {
  name: 'bench-zero-latency',
  async *runTurn() {
    yield { type: 'text' as const, text: 'bench output' };
    yield {
      type: 'done' as const,
      model: 'bench',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
      providerDurationMs: 0,
    };
  },
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger('warn'); // keep bench output clean; lineage still recorded
  const turns = Number.parseInt(argValue('--turns') ?? String(DEFAULT_BENCH_TURNS), 10);
  const pack = loadDomainPack(config.paths.domainsDir, 'generic');
  const history: ChatMessage[] = Array.from({ length: BENCH_HISTORY_MESSAGES }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `bench history message ${i} with a moderately realistic sentence in it.`,
  }));

  const deps: TurnPipelineDeps = {
    agent: zeroLatencyAgent,
    cache: createMemoryCacheStore(config.cache.ttlSeconds, Math.max(config.cache.maxEntries, turns + 1)),
    pack,
    history,
    model: 'bench-model',
    watcher: { ...config.watcher, rewriteEnabled: false },
    toolPolicy: {
      availableTools: [],
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'dontAsk',
    },
    workspaceDir: config.paths.repoRoot,
    datasetsDir: config.paths.datasetsDir,
    domainsDir: config.paths.domainsDir,
    runtimeConfigDir: config.paths.runtimeConfigDir,
    groundingConfig: config.grounding,
    mcpServers: [],
    wiredTools: [],
    registryVersion: 'bench-no-tools',
    log: logger.child('watcher'),
    // per-turn bench rows go to a scratch dir — only the summary is committed evidence
    promptHistoryDir: join(mkdtempSync(join(tmpdir(), 'protean-bench-')), 'prompt-history'),
    tokenTelemetryDir: join(mkdtempSync(join(tmpdir(), 'protean-bench-')), 'token-telemetry'),
  };

  const missOverheads: number[] = [];
  const hitTotals: number[] = [];

  for (let i = 0; i < turns; i += 1) {
    const request: TurnRequest = {
      sessionId: 'bench',
      domainId: 'generic',
      input: `bench prompt ${i}: summarise the state of the build in one sentence.`,
    };
    for await (const event of runTurn(request, deps)) {
      if (event.type === 'done') {
        const t = event.timings;
        missOverheads.push((t.assembleMs ?? 0) + (t.budgetMs ?? 0) + (t.cacheCheckMs ?? 0));
      }
    }
  }
  // cache-hit path: repeat one prompt twice, measure the second end-to-end
  for (let i = 0; i < turns; i += 1) {
    const request: TurnRequest = {
      sessionId: 'bench',
      domainId: 'generic',
      input: `bench cached prompt ${i % 10}`,
    };
    for await (const event of runTurn(request, deps)) {
      if (event.type === 'done' && event.cacheHit) hitTotals.push(event.timings.totalMs ?? 0);
    }
  }

  missOverheads.sort((a, b) => a - b);
  hitTotals.sort((a, b) => a - b);
  const report = {
    ts: new Date().toISOString(),
    turns,
    historyMessages: BENCH_HISTORY_MESSAGES,
    budgetMs: WATCHER_OVERHEAD_BUDGET_MS,
    deterministicOverheadMs: {
      p50: percentile(missOverheads, 50),
      p95: percentile(missOverheads, 95),
      max: missOverheads.at(-1) ?? 0,
    },
    cacheHitTotalMs: {
      count: hitTotals.length,
      p50: percentile(hitTotals, 50),
      p95: percentile(hitTotals, 95),
      max: hitTotals.at(-1) ?? 0,
    },
    passed: percentile(missOverheads, 95) < WATCHER_OVERHEAD_BUDGET_MS,
  };

  mkdirSync(config.paths.tokenTelemetryDir, { recursive: true });
  const outPath = join(
    config.paths.tokenTelemetryDir,
    `watcher-overhead-${report.ts.replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`evidence written: ${outPath}\n`);
  if (!report.passed) process.exitCode = 1;
}

void main();
