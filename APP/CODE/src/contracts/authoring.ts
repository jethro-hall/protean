import { z } from 'zod';

/**
 * LLM-assisted pack authoring (Phase P). Every proposal is DRAFT ONLY and
 * must be paired with its source chunk id in the GUI for human review before
 * anything saves -- this is the guardrail, not an implementation detail.
 */
export const chunkProposalSchema = z.object({
  chunkId: z.string().min(1),
  heading: z.string().min(1),
  summary: z.string().min(1),
});
export type ChunkProposal = z.infer<typeof chunkProposalSchema>;

/** What the model is asked to return for a batch of chunks -- validated, never trusted blind. */
export const chunkProposalBatchSchema = z.object({
  proposals: z.array(chunkProposalSchema),
});

export const packDraftProposalSchema = z.object({
  displayName: z.string().min(1),
  systemPrompt: z.string().min(1),
  vocabulary: z.record(z.string(), z.string()).default({}),
});
export type PackDraftProposal = z.infer<typeof packDraftProposalSchema>;
