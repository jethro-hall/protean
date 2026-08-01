import { z } from 'zod';
import type { ToolPolicy } from './agentLoop.js';
import type { ProteanMcpServerBinding, WiredTool } from './connectors.js';

/** Roles a chat message can carry across any boundary. */
export const chatRoleSchema = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Model tiers (ARCHITECTURE §5): tier selection is the Watcher's job, settings may pin it. */
export const modelTierSchema = z.enum(['fast', 'strong']);
export type ModelTier = z.infer<typeof modelTierSchema>;

/**
 * Friendly reading/response-depth presets (Phase 6) — a plain-language alternative to
 * asking someone to pick a raw token-budget number. Controls response length budget and
 * writing depth ONLY; deliberately independent of `tier` (model tier stays its own control,
 * set separately, so picking a depth never silently changes which model answers).
 */
export const responseDepthSchema = z.enum(['hscLevel', 'uniDegree', 'professor']);
export type ResponseDepth = z.infer<typeof responseDepthSchema>;

/**
 * How hard the model should think (Phase 6 sampling controls). A real Claude
 * Agent SDK field (Options.effort) — confirmed against the installed
 * @anthropic-ai/claude-agent-sdk type declarations — so it genuinely applies
 * to the built-in Fast/Strong tiers, unlike temperature (see below).
 */
export const effortLevelSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type EffortLevel = z.infer<typeof effortLevelSchema>;

/**
 * A file the user attached to a turn. `encoding: 'utf8'` (the default) is the
 * original text-only path. `encoding: 'base64'` is a zip archive — the engine
 * unpacks it server-side and expands it into individual utf8 attachments
 * before it ever reaches the prompt (see watcher/expandZipAttachments.ts), so
 * everything downstream of that expansion step still only ever sees text.
 * True arbitrary binary (images/PDF as first-class model input) is still a
 * later phase with its own contract.
 */
export const attachmentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
  textContent: z.string().min(1),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** What the outside world (GUI/CLI) sends to start a turn. */
export const turnRequestSchema = z.object({
  sessionId: z.string().min(1),
  domainId: z.string().min(1),
  input: z.string().min(1),
  tier: modelTierSchema.optional(),
  attachments: z.array(attachmentSchema).optional(),
  /**
   * Grounded-knowledge POC opt-in (Phase 6, ships OFF/unticked by default).
   * Caller intent only — has no effect unless the pack declares knowledgeCollections.
   */
  grounded: z.boolean().optional(),
  /** Friendly depth preset — see responseDepthSchema. Omitted = platform standard. */
  responseDepth: responseDepthSchema.optional(),
  /** Advanced manual override — takes precedence over responseDepth's own budget. */
  turnTokenBudget: z.number().int().positive().max(64000).optional(),
  /** Reasoning effort (Phase 6) — only applies to the built-in Fast/Strong tiers. */
  effort: effortLevelSchema.optional(),
  /**
   * Sampling temperature (Phase 6) — only applies to a custom provider
   * (gateway/adapters/customProvider.ts). The Claude Agent SDK behind the
   * built-in tiers has no such field; this is a no-op there, never faked.
   */
  temperature: z.number().min(0).max(2).optional(),
  /** Max response tokens (Phase 6) — only applies to a custom provider. */
  maxTokens: z.number().int().positive().max(32000).optional(),
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;

/** Deterministic output of the Watcher's assemble step — what actually goes to the model. */
export interface AssembledTurn {
  turnId: string;
  sessionId: string;
  domainId: string;
  input: string;
  /** Full system prompt (static + dynamic) — lineage + Watcher cache key. */
  systemPrompt: string;
  /**
   * Stable prefix eligible for Bedrock/Anthropic prompt-cache across turns.
   * Adapter places SYSTEM_PROMPT_DYNAMIC_BOUNDARY after this.
   */
  systemPromptStatic: string;
  /** Session/engine suffix after the prompt-cache boundary (protocols, etc.). */
  systemPromptDynamic: string;
  messages: ChatMessage[];
  tier: ModelTier;
  model: string;
  toolsetVersion: string;
  toolPolicy: ToolPolicy;
  workspaceDir: string;
  /** MCP bindings resolved from the Tool/Connector Registry for this turn. */
  mcpServers: ProteanMcpServerBinding[];
  /** Datasets root for in-process connectors. */
  datasetsDir: string;
  /** Domains root — required by the knowledgeBase MCP handler (Phase 6 POC). */
  domainsDir: string;
  /** Pack tool ids after registry wiring (lineage evidence). */
  wiredTools: WiredTool[];
  /** Grounded-knowledge POC: true only when requested AND the pack has collections. */
  grounded: boolean;
  /** Collection ids actually consulted to build the digest, when grounded. */
  knowledgeCollectionsUsed: string[];
  /** Per-collection relevance multiplier (Phase 6 weighting), keyed by collection id. */
  knowledgeCollectionWeights: Record<string, number>;
  /** Reasoning effort (Phase 6) — built-in tiers only, see effortLevelSchema. */
  effort?: EffortLevel;
  /** Sampling temperature (Phase 6) — custom providers only. */
  temperature?: number;
  /** Max response tokens (Phase 6) — custom providers only. */
  maxTokens?: number;
  /** Runtime cancel — not part of the cache key; seize the model when aborted. */
  abortSignal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Per-stage wall-clock timings for a turn (Law 6). All milliseconds. */
export interface TurnTimings {
  assembleMs?: number;
  budgetMs?: number;
  rewriteMs?: number;
  cacheCheckMs?: number;
  ttftMs?: number;
  modelMs?: number;
  totalMs?: number;
}

/** What kind of real work an activity event reports. Never cosmetic (UX law: truthful states). */
export type ActivityKind = 'thinking' | 'tool' | 'stage';

/** Events streamed back to the caller while a turn runs. */
export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'activity-start'; activityId: string; kind: ActivityKind; label: string }
  | { type: 'activity-delta'; activityId: string; text: string }
  | { type: 'activity-end'; activityId: string }
  | { type: 'artefact-start'; artefactId: string; artefactType: string; title: string }
  | { type: 'artefact-delta'; artefactId: string; text: string }
  | { type: 'artefact-end'; artefactId: string; complete: boolean; savedPath: string | null }
  | {
      type: 'done';
      turnId: string;
      cacheHit: boolean;
      model: string;
      usage: TokenUsage | null;
      costUsd: number | null;
      timings: TurnTimings;
    }
  | { type: 'error'; turnId: string; message: string };

/** Full lineage of one turn — the evidence trail (Law 6). Persisted to LLMBUILD_DATA. */
export interface TurnLineage {
  turnId: string;
  sessionId: string;
  domainId: string;
  startedAt: string;
  input: string;
  systemPrompt: string;
  assembledMessages: ChatMessage[];
  rewrite: string | null;
  /** The model's streamed reasoning, when it chose to think (adaptive thinking). */
  thinking: string | null;
  tier: ModelTier;
  model: string;
  cacheKey: string;
  cacheHit: boolean;
  output: string;
  usage: TokenUsage | null;
  costUsd: number | null;
  timings: TurnTimings;
  /** Registry wiring for this turn (pack tool ids → live tools). */
  wiredTools?: WiredTool[];
  /** Tool names observed via activity-start (kind=tool) during the turn. */
  toolsCalled?: string[];
  registryVersion?: string;
  /** Grounded-knowledge POC evidence (Law 6) — false/empty unless explicitly requested. */
  grounded?: boolean;
  knowledgeCollectionsUsed?: string[];
  /** Citation-honesty audit (Law 6): phrases claiming a lookup with no tool call to back it. */
  unverifiedCitationClaims?: string[];
}
