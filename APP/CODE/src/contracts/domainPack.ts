import { z } from 'zod';
import { modelTierSchema } from './turn.js';

/**
 * The Domain Pack manifest (domains/<id>/pack.json). Packs are DATA ONLY (Law 2):
 * switching packs changes behaviour with zero core-code change.
 */
export const fieldHintSchema = z.object({
  what: z.string(),
  why: z.string(),
  example: z.string().optional(),
});
export type FieldHint = z.infer<typeof fieldHintSchema>;

export const domainPackSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  systemPrompt: z.string().min(1),
  vocabulary: z.record(z.string(), z.string()).default({}),
  tools: z.array(z.string()).default([]),
  /**
   * Grounded-knowledge collection ids this pack may consult (Phase 6 POC).
   * Declaration only — consulted only when the caller opts in (TurnRequest.grounded).
   */
  knowledgeCollections: z.array(z.string()).default([]),
  outputTemplates: z.record(z.string(), z.string()).default({}),
  validation: z.record(z.string(), z.unknown()).default({}),
  tiers: z
    .object({
      default: modelTierSchema.default('strong'),
      cheapPath: modelTierSchema.default('fast'),
    })
    .default({ default: 'strong', cheapPath: 'fast' }),
  examples: z.array(z.unknown()).default([]),
  hints: z.record(z.string(), fieldHintSchema).default({}),
});
export type DomainPack = z.infer<typeof domainPackSchema>;
