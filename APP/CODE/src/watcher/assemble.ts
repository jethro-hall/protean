import { randomUUID } from 'node:crypto';
import type { ToolPolicy } from '../contracts/agentLoop.js';
import type { ProteanMcpServerBinding, WiredTool } from '../contracts/connectors.js';
import type { DomainPack } from '../contracts/domainPack.js';
import type { GroundingConfig } from '../contracts/grounding.js';
import type {
  AssembledTurn,
  Attachment,
  ChatMessage,
  ModelTier,
  TurnRequest,
} from '../contracts/turn.js';
import {
  ARTEFACT_PROTOCOL_PROMPT,
  CITATION_HONESTY_PROTOCOL_PROMPT,
  DEFAULT_HISTORY_WINDOW_MESSAGES,
  GROUNDED_REFUSAL_PROTOCOL_PROMPT,
  NARRATION_PROTOCOL_PROMPT,
  RESPONSE_DEPTH_PRESETS,
  toolsetVersionFromPolicy,
} from '../config/defaults.js';
import { estimateTokens } from './budget.js';

/**
 * Watcher step 1 — ASSEMBLE (pure code, Law 4). Pulls the domain pack's system
 * prompt, windows the session history, and appends the new user input. No LLM
 * is involved on this path; its cost is measured, not assumed.
 */
export interface AssembleInput {
  request: TurnRequest;
  pack: DomainPack;
  history: ChatMessage[];
  model: string;
  /** Resolved by the caller (server.ts / runTurn.ts) via resolveTier/resolveEffectiveTier —
   * assembleTurn records it, it does not re-derive it, so lineage can never disagree with
   * which model actually ran. */
  tier: ModelTier;
  toolPolicy: ToolPolicy;
  workspaceDir: string;
  datasetsDir: string;
  domainsDir: string;
  runtimeConfigDir: string;
  groundingConfig: GroundingConfig;
  mcpServers: ProteanMcpServerBinding[];
  wiredTools: WiredTool[];
  historyWindow?: number;
  /** Resolved by the caller via resolveGrounding() — same reasoning as `tier` above. */
  grounded: boolean;
  knowledgeCollectionsUsed: string[];
  /** Resolved by the caller via resolveGrounding() — carried through for lineage/scoring. */
  knowledgeCollectionWeights: Record<string, number>;
  /** Pre-built Tier-0 digest text (empty when not grounded) — assemble.ts stays I/O-free. */
  knowledgeDigest: string;
}

export function windowHistory(history: ChatMessage[], windowSize: number): ChatMessage[] {
  if (history.length <= windowSize) return history;
  return history.slice(history.length - windowSize);
}

export function resolveTier(request: TurnRequest, pack: DomainPack): ModelTier {
  return request.tier ?? pack.tiers.default;
}

export interface GroundingResolution {
  grounded: boolean;
  collectionIds: string[];
  /** Per-collection relevance multiplier (Phase 6 weighting) — absent id means weight 1. */
  weights: Record<string, number>;
}

/**
 * Deterministic gate (Law 4): grounding only ever turns on when the caller
 * explicitly opts in AND the pack actually declares collections — never a
 * pack-default behaviour (Phase 6 POC, ships unticked/off).
 */
export function resolveGrounding(request: TurnRequest, pack: DomainPack): GroundingResolution {
  const grounded = request.grounded === true && pack.knowledgeCollections.length > 0;
  return {
    grounded,
    collectionIds: grounded ? pack.knowledgeCollections : [],
    weights: grounded ? pack.knowledgeCollectionWeights : {},
  };
}

/**
 * Response-depth token budget: an advanced manual override (request.turnTokenBudget) always
 * wins; otherwise the friendly preset's budget; otherwise the platform default. Deliberately
 * does not touch tier (see responseDepthSchema doc) — a depth choice never changes which
 * model answers, only how much room the response has and how it's written.
 */
export function resolveTurnTokenBudget(request: TurnRequest, defaultBudget: number): number {
  if (request.turnTokenBudget !== undefined) return request.turnTokenBudget;
  if (request.responseDepth !== undefined) return RESPONSE_DEPTH_PRESETS[request.responseDepth].turnTokenBudget;
  return defaultBudget;
}

/** The preset's writing-depth instruction, or '' when no depth was requested (standard). */
export function resolveResponseDepthInstruction(request: TurnRequest): string {
  if (request.responseDepth === undefined) return '';
  return RESPONSE_DEPTH_PRESETS[request.responseDepth].instruction;
}

export interface AutoTierOptions {
  autoTierEnabled: boolean;
  autoTierEscalationTokens: number;
}

export interface TierResolution {
  tier: ModelTier;
  escalated: boolean;
  reason: string;
}

/**
 * Deterministic gate (Law 4): escalate fast→strong only when the caller left tier
 * unset (an explicit choice is intent, never second-guessed) AND the pack's default
 * is 'fast' AND the input is estimated above the auto-tier threshold. Off entirely
 * unless options.autoTierEnabled — see DEFAULT_AUTO_TIER_ESCALATION_TOKENS for why.
 */
export function resolveEffectiveTier(
  request: TurnRequest,
  pack: DomainPack,
  options: AutoTierOptions,
): TierResolution {
  const baseTier = resolveTier(request, pack);
  if (request.tier !== undefined) {
    return { tier: baseTier, escalated: false, reason: 'explicit tier requested — auto-tier never overrides intent' };
  }
  if (!options.autoTierEnabled || baseTier === 'strong') {
    return { tier: baseTier, escalated: false, reason: 'pack default tier — auto-tier off or already strong' };
  }
  const inputTokens = estimateTokens(request.input);
  if (inputTokens > options.autoTierEscalationTokens) {
    return {
      tier: 'strong',
      escalated: true,
      reason: `input ~${inputTokens} tokens exceeds the ${options.autoTierEscalationTokens}-token auto-tier threshold — escalated fast→strong`,
    };
  }
  return { tier: baseTier, escalated: false, reason: 'deterministic path — input within auto-tier threshold' };
}

/**
 * Render pack config (persona + vocabulary + declared tools + output templates)
 * into the stable system-prompt prefix. Packs stay data-only (Law 2); switching
 * packs changes this string with zero engine logic change.
 */
export function renderPackSystemPrompt(pack: DomainPack): string {
  const sections: string[] = [pack.systemPrompt];

  const vocabEntries = Object.entries(pack.vocabulary);
  if (vocabEntries.length > 0) {
    const lines = vocabEntries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([term, meaning]) => `- ${term}: ${meaning}`);
    sections.push(`Domain vocabulary:\n${lines.join('\n')}`);
  }

  if (pack.tools.length > 0) {
    sections.push(
      `Declared domain tools (registry ids):\n` + pack.tools.map((tool) => `- ${tool}`).join('\n'),
    );
  }

  const templateEntries = Object.entries(pack.outputTemplates);
  if (templateEntries.length > 0) {
    const lines = templateEntries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, shape]) => `- ${name}: ${shape}`);
    sections.push(`Output templates:\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Render attached files into the user message deterministically (Law 4):
 * clearly-delimited fenced blocks, so the model sees exactly what was uploaded
 * and the content lands in history/cache-key/lineage like any other input.
 */
export function renderInputWithAttachments(
  input: string,
  attachments: Attachment[] | undefined,
): string {
  if (attachments === undefined || attachments.length === 0) return input;
  const blocks = attachments.map(
    (file) =>
      `Attached file "${file.name}" (${file.mimeType}):\n` +
      '```\n' +
      `${file.textContent}\n` +
      '```',
  );
  return `${input}\n\n${blocks.join('\n\n')}`;
}

/** Render live registry wiring into the dynamic (per-turn) system suffix. */
export function renderWiredToolsPrompt(wiredTools: readonly WiredTool[]): string {
  if (wiredTools.length === 0) {
    return 'Tool registry: no pack-specific connectors wired; agent-loop substrate tools only.';
  }
  const lines = wiredTools.map((tool) => {
    const live =
      tool.mcpToolNames.length > 0
        ? tool.mcpToolNames.join(', ')
        : tool.sdkTools.join(', ');
    return `- ${tool.packToolId} → ${live} (${tool.description})`;
  });
  return (
    `Live tool registry wiring (use these — do not invent connectors):\n${lines.join('\n')}`
  );
}

export function assembleTurn(input: AssembleInput): AssembledTurn {
  const {
    request,
    pack,
    history,
    model,
    tier,
    toolPolicy,
    workspaceDir,
    datasetsDir,
    domainsDir,
    runtimeConfigDir,
    groundingConfig,
    mcpServers,
    wiredTools,
    grounded,
    knowledgeCollectionsUsed,
    knowledgeCollectionWeights,
    knowledgeDigest,
  } = input;
  const windowSize = input.historyWindow ?? DEFAULT_HISTORY_WINDOW_MESSAGES;
  const userContent = renderInputWithAttachments(request.input, request.attachments);
  const messages: ChatMessage[] = [
    ...windowHistory(history, windowSize),
    { role: 'user', content: userContent },
  ];
  // Pack prompt = stable, cacheable prefix. Engine protocols = suffix after the
  // provider prompt-cache boundary (Claude adapter inserts the SDK marker).
  const systemPromptStatic = renderPackSystemPrompt(pack);
  const depthInstruction = resolveResponseDepthInstruction(request);
  const systemPromptDynamic = [
    ARTEFACT_PROTOCOL_PROMPT,
    NARRATION_PROTOCOL_PROMPT,
    CITATION_HONESTY_PROTOCOL_PROMPT,
    ...(grounded ? [GROUNDED_REFUSAL_PROTOCOL_PROMPT] : []),
    renderWiredToolsPrompt(wiredTools),
    ...(knowledgeDigest !== '' ? [knowledgeDigest] : []),
    ...(depthInstruction !== '' ? [depthInstruction] : []),
  ].join('\n\n');
  return {
    turnId: randomUUID(),
    sessionId: request.sessionId,
    domainId: request.domainId,
    input: request.input,
    systemPrompt: `${systemPromptStatic}\n\n${systemPromptDynamic}`,
    systemPromptStatic,
    systemPromptDynamic,
    messages,
    tier,
    model,
    toolsetVersion: toolsetVersionFromPolicy(toolPolicy),
    toolPolicy,
    workspaceDir,
    datasetsDir,
    domainsDir,
    runtimeConfigDir,
    groundingConfig,
    mcpServers,
    wiredTools,
    grounded,
    knowledgeCollectionsUsed,
    knowledgeCollectionWeights,
    ...(request.effort !== undefined ? { effort: request.effort } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
  };
}
