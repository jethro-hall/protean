import { z } from 'zod';

/**
 * Grounded-knowledge contracts (Phase 6 POC, ships OFF by default — see BUILD_LOG).
 * A pack declares which knowledge collections it may consult (Law 2: data, not
 * code); the collections themselves are curated corpus files under
 * domains/<id>/knowledge/*.json, checked into the repo like the finance/medical
 * dataset fixtures, never fetched or fabricated at runtime.
 */

export const knowledgeChunkSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  text: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  /** ISO date the source text was captured — staleness must be visible, never silent. */
  fetchedAt: z.string().min(1),
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const knowledgeCollectionSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  chunks: z.array(knowledgeChunkSchema).min(1),
});
export type KnowledgeCollection = z.infer<typeof knowledgeCollectionSchema>;

/** One chunk's deterministic relevance score against a query (Law 4). */
export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
}

/**
 * Phase R evidence of one on-demand `query_knowledge_base` tool call this turn
 * (Law 6 — full lineage, code-computed not LLM-self-reported). Drives the
 * deterministic grounding-confidence gate in watcher/groundingConfidence.ts.
 */
export interface RetrievalTelemetryEntry {
  query: string;
  hitCount: number;
  requestedLimit: number;
  /** Top hit's score, kept for lineage/debugging only — NOT used by the confidence
   * gate, since TF-IDF and RRF-fused scores live on incompatible scales. */
  topScore: number | null;
}
