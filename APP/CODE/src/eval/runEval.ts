/**
 * Phase 2 A/B eval harness (ROADMAP): runs an eval set twice — rewrite OFF (A)
 * vs rewrite ON (B) — scores both deterministically, and writes the evidence to
 * LLMBUILD_DATA/eval-results. The rewrite stays off unless B beats A.
 *
 * Usage: npx tsx src/eval/runEval.ts [--set baseline]
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClaudeSdkAgentCore } from '../agent/adapters/claudeSdk.js';
import { loadDomainPack } from '../config/domainPacks.js';
import { loadConfig, requireModel } from '../config/loadConfig.js';
import type { TurnRequest } from '../contracts/turn.js';
import { createClaudeGateway } from '../gateway/adapters/claude.js';
import { createLogger } from '../logging/logger.js';
import { createMemoryCacheStore } from '../watcher/cache.js';
import { resolveEffectiveTier, resolveTier } from '../watcher/assemble.js';
import { runTurn, type TurnPipelineDeps } from '../watcher/runTurn.js';
import { loadEvalSet, type EvalItem, type EvalSet } from './evalSet.js';
import { scoreOutput } from './score.js';

const DEFAULT_EVAL_SET_ID = 'baseline';

interface ItemResult {
  itemId: string;
  arm: 'A-noRewrite' | 'B-rewrite' | 'C-autoTier';
  score: number;
  failures: string[];
  ttftMs: number | null;
  totalMs: number | null;
  rewriteMs: number | null;
  outputChars: number;
  error: string | null;
  /** Arm C only: did the deterministic gate actually escalate this item to strong? */
  tierEscalated?: boolean;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runItem(
  item: EvalItem,
  set: EvalSet,
  arm: ItemResult['arm'],
  deps: TurnPipelineDeps,
  tierEscalated?: boolean,
): Promise<ItemResult> {
  const request: TurnRequest = {
    sessionId: `eval-${arm}-${randomUUID()}`,
    domainId: set.domainId,
    input: item.prompt,
  };
  let output = '';
  let ttftMs: number | null = null;
  let totalMs: number | null = null;
  let rewriteMs: number | null = null;
  let error: string | null = null;
  for await (const event of runTurn(request, deps)) {
    if (event.type === 'text') output += event.text;
    else if (event.type === 'done') {
      ttftMs = event.timings.ttftMs ?? null;
      totalMs = event.timings.totalMs ?? null;
      rewriteMs = event.timings.rewriteMs ?? null;
    } else if (event.type === 'error') error = event.message;
  }
  const scored = scoreOutput(output, item.checks);
  return {
    itemId: item.id,
    arm,
    score: scored.score,
    failures: scored.failures,
    ttftMs,
    totalMs,
    rewriteMs,
    outputChars: output.length,
    error,
    ...(tierEscalated !== undefined ? { tierEscalated } : {}),
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const log = logger.child('watcher');
  const setId = argValue('--set') ?? DEFAULT_EVAL_SET_ID;
  const set = loadEvalSet(config.paths.evalSetsDir, setId);
  const pack = loadDomainPack(config.paths.domainsDir, set.domainId);
  const model = requireModel(config, resolveTier({ sessionId: 'x', domainId: set.domainId, input: 'x' }, pack));
  const fastModel = requireModel(config, 'fast');
  const gateway = createClaudeGateway(logger.child('gateway'));
  const agent = createClaudeSdkAgentCore(gateway, logger.child('agent'));

  const baseDeps = {
    agent,
    gateway,
    pack,
    history: [],
    model,
    log,
    toolPolicy: {
      availableTools: config.agentLoop.availableTools,
      allowedTools: config.agentLoop.allowedTools,
      maxTurns: config.agentLoop.maxTurns,
      permissionMode: config.agentLoop.permissionMode,
    },
    workspaceDir: config.paths.repoRoot,
    datasetsDir: config.paths.datasetsDir,
    domainsDir: config.paths.domainsDir,
    mcpServers: [],
    wiredTools: [],
    registryVersion: 'eval-substrate',
    promptHistoryDir: config.paths.promptHistoryDir,
    tokenTelemetryDir: config.paths.tokenTelemetryDir,
  };

  const results: ItemResult[] = [];
  for (const item of set.items) {
    // fresh cache per arm/item so A, B, and C are all genuine model runs
    results.push(
      await runItem(item, set, 'A-noRewrite', {
        ...baseDeps,
        cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
        watcher: { ...config.watcher, rewriteEnabled: false, autoTierEnabled: false, fastModel },
      }),
    );
    results.push(
      await runItem(item, set, 'B-rewrite', {
        ...baseDeps,
        cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
        watcher: { ...config.watcher, rewriteEnabled: true, autoTierEnabled: false, fastModel },
      }),
    );
    // Arm C tests auto-tier escalation. Unlike A/B (which reuse the fixed baseline
    // `model`), escalation is per-item input-dependent — reusing the fixed model
    // here would let the lineage `tier` claim strong while a fast model actually
    // ran (Law 6). Resolve tier+model per item, exactly as server.ts does live.
    const itemRequest: TurnRequest = {
      sessionId: `eval-tier-probe-${randomUUID()}`,
      domainId: set.domainId,
      input: item.prompt,
    };
    const tierDecision = resolveEffectiveTier(itemRequest, pack, {
      autoTierEnabled: true,
      autoTierEscalationTokens: config.watcher.autoTierEscalationTokens,
    });
    results.push(
      await runItem(
        item,
        set,
        'C-autoTier',
        {
          ...baseDeps,
          model: requireModel(config, tierDecision.tier),
          cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
          watcher: { ...config.watcher, rewriteEnabled: false, autoTierEnabled: true, fastModel },
        },
        tierDecision.escalated,
      ),
    );
  }

  const armA = results.filter((r) => r.arm === 'A-noRewrite');
  const armB = results.filter((r) => r.arm === 'B-rewrite');
  const armC = results.filter((r) => r.arm === 'C-autoTier');
  const tierEscalations = armC.filter((r) => r.tierEscalated === true).length;
  const summary = {
    ts: new Date().toISOString(),
    setId: set.id,
    model,
    fastModel,
    items: set.items.length,
    meanScoreA: mean(armA.map((r) => r.score)),
    meanScoreB: mean(armB.map((r) => r.score)),
    meanScoreC: mean(armC.map((r) => r.score)),
    meanTotalMsA: mean(armA.map((r) => r.totalMs ?? 0)),
    meanTotalMsB: mean(armB.map((r) => r.totalMs ?? 0)),
    meanTotalMsC: mean(armC.map((r) => r.totalMs ?? 0)),
    rewritesApplied: armB.filter((r) => r.rewriteMs !== null).length,
    tierEscalations,
    verdict: '' as string,
    tierVerdict: '' as string,
    results,
  };
  // A verdict is only evidence if arm B actually rewrote something; otherwise
  // both arms ran identical prompts and any delta is model nondeterminism.
  summary.verdict =
    summary.rewritesApplied === 0
      ? 'INVALID — rewrite gate never fired on this set (arms were identical); ' +
        'fix the set to exceed the bloat threshold before drawing any conclusion'
      : summary.meanScoreB > summary.meanScoreA
        ? 'B (rewrite) improves the score — consider enabling PROTEAN_REWRITE_ENABLED=1'
        : 'rewrite does NOT pay for itself on this set — keep it off (per charter, cut it)';
  // Same honesty rule for the tier gate: bloat (rewrite's signal) and complexity
  // (auto-tier's signal) are deliberately different thresholds — a set built to
  // fire the rewrite gate is not evidence either way for auto-tier.
  summary.tierVerdict =
    tierEscalations === 0
      ? 'INVALID for auto-tier — this set never crossed the auto-tier threshold (it targets ' +
        'rewrite/bloat, a different signal); build a complexity-focused eval set before judging ' +
        'PROTEAN_AUTO_TIER_ENABLED=1'
      : summary.meanScoreC > summary.meanScoreA
        ? 'C (auto-tier) improves the score on the items it escalated — consider enabling PROTEAN_AUTO_TIER_ENABLED=1'
        : 'auto-tier escalation does NOT pay for itself on this set — keep it off';

  mkdirSync(config.paths.evalResultsDir, { recursive: true });
  const outPath = join(
    config.paths.evalResultsDir,
    `${set.id}-${summary.ts.replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  logger.log(
    'info',
    'watcher',
    'eval.done',
    `A/B/C eval "${set.id}" complete: A=${summary.meanScoreA.toFixed(3)} B=${summary.meanScoreB.toFixed(3)} C=${summary.meanScoreC.toFixed(3)} — ${summary.verdict} | ${summary.tierVerdict}`,
    { data: { outPath } },
  );
}

void main();
