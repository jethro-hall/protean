import { performance } from 'node:perf_hooks';
import type { AgentCore } from '../agent/AgentCore.js';
import type { DomainPack } from '../contracts/domainPack.js';
import type {
  ChatMessage,
  TokenUsage,
  TurnEvent,
  TurnRequest,
  TurnTimings,
} from '../contracts/turn.js';
import type { LayerLogger } from '../logging/logger.js';
import type { LlmGateway } from '../gateway/LlmGateway.js';
import { assembleTurn } from './assemble.js';
import { budgetMessages } from './budget.js';
import { computeCacheKey, type CacheStore } from './cache.js';
import { recordLineage, recordTelemetry } from './record.js';
import { rewriteTurnInput, shouldRewriteTurn } from './rewrite.js';

/**
 * The Watcher choke point (ARCHITECTURE §3): every turn bound for an answering
 * LLM passes through here. Deterministic path: assemble → budget → (conditional
 * rewrite) → cache-check → (agent on miss) → record. Each stage is timed —
 * we measure, never assume.
 */
export interface WatcherOptions {
  turnTokenBudget: number;
  rewriteEnabled: boolean;
  rewriteBloatTokens: number;
  /** Fast model for the Tier-1 rewrite; rewrite is skipped (and logged) if unset. */
  fastModel?: string;
}

export interface TurnPipelineDeps {
  agent: AgentCore;
  /** Used ONLY for the conditional Tier-1 rewrite; answering goes through the agent. */
  gateway?: LlmGateway;
  cache: CacheStore;
  pack: DomainPack;
  history: ChatMessage[];
  model: string;
  watcher: WatcherOptions;
  log: LayerLogger;
  promptHistoryDir: string;
  tokenTelemetryDir: string;
}

const MS_PRECISION = 2;
const roundMs = (ms: number): number => Number(ms.toFixed(MS_PRECISION));

export async function* runTurn(
  request: TurnRequest,
  deps: TurnPipelineDeps,
): AsyncIterable<TurnEvent> {
  const { agent, cache, pack, history, model, watcher, log } = deps;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const assembled = assembleTurn({ request, pack, history, model });
  const assembleMs = roundMs(performance.now() - t0);

  const tBudget = performance.now();
  const budget = budgetMessages(assembled.messages, watcher.turnTokenBudget);
  assembled.messages = budget.messages;
  const budgetMs = roundMs(performance.now() - tBudget);
  if (budget.droppedMessages > 0) {
    log.info(
      'watcher.budget.trimmed',
      `Budget trimmed ${budget.droppedMessages} oldest messages to fit ~${watcher.turnTokenBudget} tokens (now ~${budget.estimatedTokens})`,
      { turnId: assembled.turnId, sessionId: assembled.sessionId },
    );
  }

  // Conditional Tier-1 rewrite: deterministic gate, measured generative step (ARCHITECTURE §3.4).
  let rewrite: string | null = null;
  let rewriteMs: number | undefined;
  const decision = shouldRewriteTurn(assembled, watcher.rewriteBloatTokens);
  if (watcher.rewriteEnabled && decision.rewrite) {
    if (deps.gateway === undefined || watcher.fastModel === undefined) {
      log.warn(
        'watcher.rewrite.skipped',
        `Rewrite gate fired (${decision.reason}) but no fast model/gateway configured — proceeding without rewrite`,
        { turnId: assembled.turnId },
      );
    } else {
      const result = await rewriteTurnInput(deps.gateway, assembled, watcher.fastModel, log);
      rewriteMs = result.rewriteMs;
      if (result.text !== assembled.input) {
        rewrite = result.text;
        const lastIndex = assembled.messages.length - 1;
        assembled.messages = assembled.messages.map((message, index) =>
          index === lastIndex ? { ...message, content: result.text } : message,
        );
      }
    }
  }

  const tCache = performance.now();
  const cacheKey = computeCacheKey(assembled);
  const cached = cache.get(cacheKey);
  const cacheCheckMs = roundMs(performance.now() - tCache);
  const timings: TurnTimings = {
    assembleMs,
    budgetMs,
    cacheCheckMs,
    ...(rewriteMs !== undefined ? { rewriteMs } : {}),
  };

  log.info(
    'watcher.assembled',
    `Assembled turn for domain "${assembled.domainId}" (${assembled.messages.length} messages, ~${budget.estimatedTokens} tokens, tier ${assembled.tier}); ${decision.reason}; cache ${cached !== undefined ? 'HIT' : 'MISS'}`,
    { turnId: assembled.turnId, sessionId: assembled.sessionId, data: { cacheKey, assembleMs, budgetMs, cacheCheckMs } },
  );

  let output = '';
  let usage: TokenUsage | null = null;
  let costUsd: number | null = null;
  let failed: string | null = null;

  if (cached !== undefined) {
    output = cached.output;
    usage = cached.usage;
    costUsd = cached.costUsd;
    timings.ttftMs = roundMs(performance.now() - t0);
    yield { type: 'text', text: cached.output };
  } else {
    for await (const event of agent.runTurn(assembled)) {
      if (event.type === 'text') {
        if (timings.ttftMs === undefined) timings.ttftMs = roundMs(performance.now() - t0);
        output += event.text;
        yield { type: 'text', text: event.text };
      } else if (event.type === 'done') {
        usage = event.usage;
        costUsd = event.costUsd;
        if (event.providerDurationMs !== null) timings.modelMs = event.providerDurationMs;
      } else {
        failed = event.message;
      }
    }
    if (failed === null) {
      cache.set(cacheKey, { output, model, usage, costUsd, storedAt: new Date().toISOString() });
    }
  }

  timings.totalMs = roundMs(performance.now() - t0);

  if (failed !== null) {
    log.error('watcher.turn.failed', `Turn failed after ${timings.totalMs} ms: ${failed}`, {
      turnId: assembled.turnId,
      sessionId: assembled.sessionId,
    });
    yield { type: 'error', turnId: assembled.turnId, message: failed };
    return;
  }

  recordLineage(deps.promptHistoryDir, {
    turnId: assembled.turnId,
    sessionId: assembled.sessionId,
    domainId: assembled.domainId,
    startedAt,
    input: assembled.input,
    systemPrompt: assembled.systemPrompt,
    assembledMessages: assembled.messages,
    rewrite,
    tier: assembled.tier,
    model,
    cacheKey,
    cacheHit: cached !== undefined,
    output,
    usage,
    costUsd,
    timings,
  });
  recordTelemetry(deps.tokenTelemetryDir, {
    ts: startedAt,
    turnId: assembled.turnId,
    sessionId: assembled.sessionId,
    domainId: assembled.domainId,
    model,
    cacheHit: cached !== undefined,
    ttftMs: timings.ttftMs ?? null,
    totalMs: timings.totalMs,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    costUsd,
  });
  log.info(
    'watcher.turn.done',
    `Turn complete in ${timings.totalMs} ms (TTFT ${timings.ttftMs ?? 'n/a'} ms, cache ${cached !== undefined ? 'hit' : 'miss'})`,
    { turnId: assembled.turnId, sessionId: assembled.sessionId, data: { ...timings } },
  );

  yield {
    type: 'done',
    turnId: assembled.turnId,
    cacheHit: cached !== undefined,
    model,
    usage,
    costUsd,
    timings,
  };
}
