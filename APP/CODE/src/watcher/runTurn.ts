import { performance } from 'node:perf_hooks';
import type { AgentCore } from '../agent/AgentCore.js';
import { TURN_STOPPED_MESSAGE } from '../config/defaults.js';
import type { ToolPolicy } from '../contracts/agentLoop.js';
import type { ProteanMcpServerBinding, WiredTool } from '../contracts/connectors.js';
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
import {
  createArtefactParser,
  saveArtefact,
  type ArtefactParserEvent,
  type ArtefactType,
} from './artefacts.js';
import { assembleTurn, resolveEffectiveTier, resolveGrounding } from './assemble.js';
import { budgetMessages } from './budget.js';
import { computeCacheKey, type CacheStore } from './cache.js';
import { findUnverifiedProvenanceClaims } from './citationGuard.js';
import { loadKnowledgeCollections } from '../config/knowledgeCollections.js';
import { recordLineage, recordTelemetry } from './record.js';
import { rewriteTurnInput, shouldRewriteTurn } from './rewrite.js';
import type { SessionStore } from './sessionStore.js';
import { buildDigest } from '../tools/knowledge/digest.js';

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
  autoTierEnabled: boolean;
  autoTierEscalationTokens: number;
}

export interface TurnPipelineDeps {
  agent: AgentCore;
  /** Used ONLY for the conditional Tier-1 rewrite; answering goes through the agent. */
  gateway?: LlmGateway;
  cache: CacheStore;
  pack: DomainPack;
  history: ChatMessage[];
  /** When provided, the Watcher records the turn into session history (it owns history). */
  sessions?: SessionStore;
  model: string;
  watcher: WatcherOptions;
  /** Dynamic agent-loop policy (tools + maxTurns). Required for answering turns. */
  toolPolicy: ToolPolicy;
  /** Workspace root for file tools. */
  workspaceDir: string;
  datasetsDir: string;
  domainsDir: string;
  mcpServers: ProteanMcpServerBinding[];
  wiredTools: WiredTool[];
  registryVersion: string;
  /** Client Stop / disconnect — seize the model run. */
  abortSignal?: AbortSignal;
  log: LayerLogger;
  promptHistoryDir: string;
  tokenTelemetryDir: string;
  /** Required for Phase 3 artefact persistence; artefacts are skipped-with-log if unset. */
  artefactsDir?: string;
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

  // Resolved ONCE here and by the caller (server.ts) picking `model` from the same
  // request+pack+config — deterministic, so both agree on which tier actually ran (Law 6).
  const tierDecision = resolveEffectiveTier(request, pack, {
    autoTierEnabled: watcher.autoTierEnabled,
    autoTierEscalationTokens: watcher.autoTierEscalationTokens,
  });

  // Grounded-knowledge POC (Phase 6, off unless the caller opts in): the actual
  // corpus read (I/O) happens here, not in assemble.ts (Law 4 keeps assembly pure).
  const grounding = resolveGrounding(request, pack);
  const knowledgeDigest =
    grounding.grounded && grounding.collectionIds.length > 0
      ? buildDigest(loadKnowledgeCollections(deps.domainsDir, grounding.collectionIds))
      : '';

  const assembled = assembleTurn({
    request,
    pack,
    history,
    model,
    tier: tierDecision.tier,
    toolPolicy: deps.toolPolicy,
    workspaceDir: deps.workspaceDir,
    datasetsDir: deps.datasetsDir,
    domainsDir: deps.domainsDir,
    mcpServers: deps.mcpServers,
    wiredTools: deps.wiredTools,
    grounded: grounding.grounded,
    knowledgeCollectionsUsed: grounding.collectionIds,
    knowledgeDigest,
  });
  if (deps.abortSignal !== undefined) {
    assembled.abortSignal = deps.abortSignal;
  }
  const assembleMs = roundMs(performance.now() - t0);
  // what actually entered the context (input + attachment blocks) — this is what history records
  const userContent = assembled.messages.at(-1)?.content ?? assembled.input;

  // Truthful stage chips: each attachment really was read into the context here.
  for (const [index, file] of (request.attachments ?? []).entries()) {
    const activityId = `${assembled.turnId}-file${index}`;
    const sizeKb = (file.textContent.length / 1024).toFixed(1);
    yield {
      type: 'activity-start',
      activityId,
      kind: 'stage',
      label: `Read ${file.name} (${sizeKb} KB) into context`,
    };
    yield { type: 'activity-end', activityId };
  }

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
    `Assembled turn for domain "${assembled.domainId}" (${assembled.messages.length} messages, ~${budget.estimatedTokens} tokens, tier ${assembled.tier} — ${tierDecision.reason}); ${decision.reason}; grounded ${assembled.grounded ? `ON [${assembled.knowledgeCollectionsUsed.join(', ')}]` : 'off'}; cache ${cached !== undefined ? 'HIT' : 'MISS'}`,
    {
      turnId: assembled.turnId,
      sessionId: assembled.sessionId,
      data: {
        cacheKey,
        assembleMs,
        budgetMs,
        cacheCheckMs,
        tierEscalated: tierDecision.escalated,
        grounded: assembled.grounded,
        knowledgeCollectionsUsed: assembled.knowledgeCollectionsUsed,
      },
    },
  );

  let output = '';
  let thinking = '';
  const toolsCalled: string[] = [];
  let usage: TokenUsage | null = null;
  let costUsd: number | null = null;
  let failed: string | null = null;

  // Phase 3: split the raw model stream deterministically into chat text and artefacts.
  const parser = createArtefactParser();
  let artefactCounter = 0;
  let currentArtefact: { id: string; artefactType: ArtefactType; title: string; content: string } | null =
    null;
  const persistArtefacts = cached === undefined; // cache hits re-emit but never re-save

  function* mapParserEvents(parserEvents: ArtefactParserEvent[]): Generator<TurnEvent> {
    for (const parserEvent of parserEvents) {
      if (timings.ttftMs === undefined && parserEvent.kind !== 'end') {
        timings.ttftMs = roundMs(performance.now() - t0);
      }
      if (parserEvent.kind === 'chat') {
        yield { type: 'text', text: parserEvent.text };
      } else if (parserEvent.kind === 'start') {
        artefactCounter += 1;
        currentArtefact = {
          id: `${assembled.turnId}-a${artefactCounter}`,
          artefactType: parserEvent.artefactType,
          title: parserEvent.title,
          content: '',
        };
        yield {
          type: 'artefact-start',
          artefactId: currentArtefact.id,
          artefactType: currentArtefact.artefactType,
          title: currentArtefact.title,
        };
      } else if (parserEvent.kind === 'delta') {
        if (currentArtefact !== null) {
          currentArtefact.content += parserEvent.text;
          yield { type: 'artefact-delta', artefactId: currentArtefact.id, text: parserEvent.text };
        }
      } else if (currentArtefact !== null) {
        let savedPath: string | null = null;
        if (persistArtefacts && deps.artefactsDir !== undefined) {
          savedPath = saveArtefact(
            deps.artefactsDir,
            assembled.sessionId,
            currentArtefact.id,
            currentArtefact.artefactType,
            currentArtefact.content,
          );
          log.info(
            'watcher.artefact.saved',
            `Artefact "${currentArtefact.title}" (${currentArtefact.artefactType}, ${currentArtefact.content.length} chars, ${parserEvent.complete ? 'complete' : 'INCOMPLETE stream'}) saved`,
            { turnId: assembled.turnId, sessionId: assembled.sessionId, data: { savedPath } },
          );
        } else if (persistArtefacts) {
          log.warn(
            'watcher.artefact.unsaved',
            'Artefact finished but no artefactsDir configured — not persisted',
            { turnId: assembled.turnId },
          );
        }
        yield {
          type: 'artefact-end',
          artefactId: currentArtefact.id,
          complete: parserEvent.complete,
          savedPath,
        };
        currentArtefact = null;
      }
    }
  }

  if (cached !== undefined) {
    output = cached.output;
    usage = cached.usage;
    costUsd = cached.costUsd;
    yield* mapParserEvents([...parser.push(cached.output), ...parser.flush()]);
    timings.ttftMs ??= roundMs(performance.now() - t0);
  } else {
    for await (const event of agent.runTurn(assembled)) {
      if (event.type === 'text') {
        output += event.text;
        yield* mapParserEvents(parser.push(event.text));
      } else if (
        event.type === 'activity-start' ||
        event.type === 'activity-delta' ||
        event.type === 'activity-end'
      ) {
        if (event.type === 'activity-delta') thinking += event.text;
        if (event.type === 'activity-start' && event.kind === 'tool') {
          const match = /^Using tool:\s*(.+)$/.exec(event.label);
          const toolName = match?.[1]?.trim();
          if (toolName !== undefined && toolName !== '' && !toolsCalled.includes(toolName)) {
            toolsCalled.push(toolName);
          }
        }
        if (timings.ttftMs === undefined && event.type === 'activity-start') {
          // first sign of life from the model — an honest first token
          timings.ttftMs = roundMs(performance.now() - t0);
        }
        yield event;
      } else if (event.type === 'done') {
        usage = event.usage;
        costUsd = event.costUsd;
        if (event.providerDurationMs !== null) timings.modelMs = event.providerDurationMs;
      } else {
        failed = event.message;
      }
    }
    yield* mapParserEvents(parser.flush());
    if (failed === null) {
      cache.set(cacheKey, { output, model, usage, costUsd, storedAt: new Date().toISOString() });
    }
  }

  timings.totalMs = roundMs(performance.now() - t0);

  const stopped = failed === TURN_STOPPED_MESSAGE || deps.abortSignal?.aborted === true;
  if (stopped) {
    failed = TURN_STOPPED_MESSAGE;
  }

  if ((failed === null || stopped) && deps.sessions !== undefined) {
    // the Watcher owns history (ARCHITECTURE §3): raw output kept so follow-ups can edit
    // artefacts; userContent includes attachment blocks so files stay in context across turns.
    // Stopped turns keep partial output so the next message still has context.
    deps.sessions.append(assembled.sessionId, { role: 'user', content: userContent });
    deps.sessions.append(assembled.sessionId, {
      role: 'assistant',
      content: stopped && output === '' ? '[stopped]' : output,
    });
  }

  if (failed !== null) {
    if (stopped) {
      log.info('watcher.turn.stopped', `Turn stopped after ${timings.totalMs} ms`, {
        turnId: assembled.turnId,
        sessionId: assembled.sessionId,
      });
    } else {
      log.error('watcher.turn.failed', `Turn failed after ${timings.totalMs} ms: ${failed}`, {
        turnId: assembled.turnId,
        sessionId: assembled.sessionId,
      });
    }
    yield { type: 'error', turnId: assembled.turnId, message: failed };
    return;
  }

  const unverifiedCitationClaims = findUnverifiedProvenanceClaims(output, toolsCalled);
  if (unverifiedCitationClaims.length > 0) {
    log.warn(
      'watcher.unverified_citation_claim',
      `Output claims a lookup ("${unverifiedCitationClaims.join('", "')}") but no tool was called this turn — likely fabricated provenance`,
      { turnId: assembled.turnId, sessionId: assembled.sessionId, data: { unverifiedCitationClaims } },
    );
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
    thinking: thinking !== '' ? thinking : null,
    tier: assembled.tier,
    model,
    cacheKey,
    cacheHit: cached !== undefined,
    output,
    usage,
    costUsd,
    timings,
    wiredTools: deps.wiredTools,
    toolsCalled,
    registryVersion: deps.registryVersion,
    grounded: assembled.grounded,
    knowledgeCollectionsUsed: assembled.knowledgeCollectionsUsed,
    ...(unverifiedCitationClaims.length > 0 ? { unverifiedCitationClaims } : {}),
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
    cacheReadTokens: usage?.cacheReadTokens ?? null,
    cacheCreationTokens: usage?.cacheCreationTokens ?? null,
    costUsd,
  });
  log.info(
    'watcher.turn.done',
    `Turn complete in ${timings.totalMs} ms (TTFT ${timings.ttftMs ?? 'n/a'} ms, answer-cache ${cached !== undefined ? 'hit' : 'miss'}, cost ${costUsd ?? 'n/a'} USD)`,
    {
      turnId: assembled.turnId,
      sessionId: assembled.sessionId,
      data: {
        ...timings,
        usage,
        costUsd,
      },
    },
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
