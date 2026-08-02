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

/**
 * LLM oversight/completeness check (owner-directed): compares the deterministic
 * chunker's output against the raw extracted source text and flags anything a
 * heuristic chunker may have silently dropped or corrupted. A CHECK, not a
 * source of truth (Law 4) -- it never edits chunks, only flags for human review.
 */
export const chunkFidelityReportSchema = z.object({
  verdict: z.enum(['clean', 'issues-found']),
  missingFacts: z.array(z.string()).default([]),
  suspiciousAdditions: z.array(z.string()).default([]),
});
export type ChunkFidelityReport = z.infer<typeof chunkFidelityReportSchema>;

export const packDraftProposalSchema = z.object({
  displayName: z.string().min(1),
  systemPrompt: z.string().min(1),
  vocabulary: z.record(z.string(), z.string()).default({}),
});
export type PackDraftProposal = z.infer<typeof packDraftProposalSchema>;
