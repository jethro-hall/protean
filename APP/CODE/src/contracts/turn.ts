import { z } from 'zod';

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
 * A text file the user attached to a turn. Text-only for now — binary
 * (images/PDF) arrives with a later phase and its own contract.
 */
export const attachmentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
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
});
export type TurnRequest = z.infer<typeof turnRequestSchema>;

/** Deterministic output of the Watcher's assemble step — what actually goes to the model. */
export interface AssembledTurn {
  turnId: string;
  sessionId: string;
  domainId: string;
  input: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tier: ModelTier;
  model: string;
  toolsetVersion: string;
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
}
