/**
 * Phase 0 acceptance spike (ROADMAP Phase 0): run the SAME prompt twice through
 * AgentCore → Gateway → Claude Agent SDK. Run 1 is a live model call (records
 * TTFT + total). Run 2 must be a cache hit in < 300 ms. Numbers are written to
 * APP/LLMBUILD_DATA/token-telemetry/ and printed for the BUILD_LOG.
 *
 * Usage: npm run spike [-- --prompt "..."] [--domain generic]
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClaudeSdkAgentCore } from './agent/adapters/claudeSdk.js';
import { DEFAULT_DOMAIN_ID } from './config/defaults.js';
import { loadDomainPack } from './config/domainPacks.js';
import { loadConfig, requireModel } from './config/loadConfig.js';
import type { TurnEvent, TurnRequest, TurnTimings } from './contracts/turn.js';
import { createClaudeGateway } from './gateway/adapters/claude.js';
import { createLogger } from './logging/logger.js';
import { createMemoryCacheStore } from './watcher/cache.js';
import { resolveTier } from './watcher/assemble.js';
import { runTurn, type TurnPipelineDeps } from './watcher/runTurn.js';

const CACHE_HIT_BUDGET_MS = 300; // ROADMAP Phase 0 acceptance threshold
const DEFAULT_SPIKE_PROMPT =
  'In two sentences, what is time-to-first-token and why does it matter for a chat UI?';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface SpikeRun {
  run: number;
  cacheHit: boolean;
  timings: TurnTimings;
  outputChars: number;
  error?: string;
}

async function executeRun(
  runNumber: number,
  request: TurnRequest,
  deps: TurnPipelineDeps,
): Promise<SpikeRun> {
  let cacheHit = false;
  let timings: TurnTimings = {};
  let outputChars = 0;
  let error: string | undefined;
  process.stdout.write(`\n--- run ${runNumber} ---\n`);
  for await (const event of runTurn(request, deps) as AsyncIterable<TurnEvent>) {
    if (event.type === 'text') {
      outputChars += event.text.length;
      process.stdout.write(event.text);
    } else if (event.type === 'done') {
      cacheHit = event.cacheHit;
      timings = event.timings;
    } else if (event.type === 'error') {
      error = event.message;
    }
  }
  process.stdout.write('\n');
  return { run: runNumber, cacheHit, timings, outputChars, ...(error !== undefined ? { error } : {}) };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const log = logger.child('spike');
  const domainId = argValue('--domain') ?? DEFAULT_DOMAIN_ID;
  const input = argValue('--prompt') ?? DEFAULT_SPIKE_PROMPT;

  const pack = loadDomainPack(config.paths.domainsDir, domainId);
  const request: TurnRequest = { sessionId: `spike-${randomUUID()}`, domainId, input };
  const model = requireModel(config, resolveTier(request, pack));

  const gateway = createClaudeGateway(logger.child('gateway'));
  const deps: TurnPipelineDeps = {
    agent: createClaudeSdkAgentCore(gateway, logger.child('agent')),
    gateway,
    cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
    pack,
    history: [], // identical assembled prompt both runs — the cache-hit precondition
    model,
    watcher: {
      turnTokenBudget: config.watcher.turnTokenBudget,
      rewriteEnabled: config.watcher.rewriteEnabled,
      rewriteBloatTokens: config.watcher.rewriteBloatTokens,
      autoTierEnabled: config.watcher.autoTierEnabled,
      autoTierEscalationTokens: config.watcher.autoTierEscalationTokens,
      ...(config.models.fast !== undefined ? { fastModel: config.models.fast } : {}),
    },
    toolPolicy: {
      availableTools: config.agentLoop.availableTools,
      allowedTools: config.agentLoop.allowedTools,
      maxTurns: config.agentLoop.maxTurns,
      permissionMode: config.agentLoop.permissionMode,
    },
    workspaceDir: config.paths.repoRoot,
    datasetsDir: config.paths.datasetsDir,
    mcpServers: [],
    wiredTools: [],
    registryVersion: 'spike-substrate',
    log: logger.child('watcher'),
    promptHistoryDir: config.paths.promptHistoryDir,
    tokenTelemetryDir: config.paths.tokenTelemetryDir,
  };

  const first = await executeRun(1, request, deps);
  const second = await executeRun(2, request, deps);

  const cacheHitFastEnough =
    second.cacheHit && (second.timings.totalMs ?? Number.POSITIVE_INFINITY) < CACHE_HIT_BUDGET_MS;
  const passed = first.error === undefined && second.error === undefined && cacheHitFastEnough;

  const summary = {
    ts: new Date().toISOString(),
    model,
    domainId,
    prompt: input,
    acceptance: {
      cacheHitBudgetMs: CACHE_HIT_BUDGET_MS,
      passed,
    },
    runs: [first, second],
  };
  mkdirSync(config.paths.tokenTelemetryDir, { recursive: true });
  const summaryPath = join(
    config.paths.tokenTelemetryDir,
    `spike-${summary.ts.replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  console.log('\n=== Phase 0 spike summary ===');
  console.log(`model:            ${model}`);
  console.log(
    `run 1 (live):     TTFT ${first.timings.ttftMs ?? 'n/a'} ms · total ${first.timings.totalMs ?? 'n/a'} ms · cacheHit=${first.cacheHit}`,
  );
  console.log(
    `run 2 (cache):    TTFT ${second.timings.ttftMs ?? 'n/a'} ms · total ${second.timings.totalMs ?? 'n/a'} ms · cacheHit=${second.cacheHit}`,
  );
  console.log(`acceptance:       ${passed ? 'PASS' : 'FAIL'} (cache run < ${CACHE_HIT_BUDGET_MS} ms)`);
  console.log(`evidence written: ${summaryPath}`);
  log.info('spike.done', `Phase 0 spike ${passed ? 'PASSED' : 'FAILED'}`, {
    data: { summaryPath, passed },
  });
  if (!passed) process.exitCode = 1;
}

void main();
