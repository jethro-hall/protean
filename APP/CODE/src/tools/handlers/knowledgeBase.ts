import { loadKnowledgeCollections, loadKnowledgeCollectionsWithOverlay } from '../../config/knowledgeCollections.js';
import type { KnowledgeChunk, ScoredChunk } from '../../contracts/knowledge.js';
import type { EmbeddingGateway } from '../../gateway/embeddings/EmbeddingGateway.js';
import type { VectorStore } from '../../contracts/vectorStore.js';
import { hybridScoreChunks, topChunks } from '../knowledge/retrieval.js';

export interface KnowledgeQueryHit {
  heading: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  fetchedAt: string;
  score: number;
}

export interface HybridSearchServices {
  vectorStore: VectorStore;
  embeddingGateway: EmbeddingGateway;
}

/**
 * Tier-1 on-demand retrieval (Law 4: deterministic, no LLM in the ranking
 * itself). Called only when the model decides the Tier-0 digest isn't
 * enough — exact wording, a figure, an edge case. Collections are the same
 * curated corpus the digest was built from, so nothing here can disagree
 * with the digest's citations.
 *
 * Hybrid (Phase Q): when `hybrid` services are provided, ranks via
 * TF-IDF + vector similarity (Reciprocal Rank Fusion). Falls back to pure
 * TF-IDF if the embedding call or vector store fails — never a hard turn
 * failure (ADR-0003's "optional and degradable" ethos, extended to vectors).
 */
export async function queryKnowledgeBase(
  domainsDir: string,
  collectionIds: readonly string[],
  query: string,
  limit = 5,
  /** Per-collection relevance multiplier (Phase 6 weighting) — absent id means weight 1. */
  weights: Record<string, number> = {},
  /** When provided, overlay-only collections (Phase P, built via PDF ingestion) are also visible. */
  runtimeConfigDir?: string,
  hybrid?: HybridSearchServices,
): Promise<KnowledgeQueryHit[]> {
  const collections =
    runtimeConfigDir !== undefined
      ? loadKnowledgeCollectionsWithOverlay(runtimeConfigDir, domainsDir, collectionIds)
      : loadKnowledgeCollections(domainsDir, collectionIds);
  const collectionIdByChunkId = new Map<string, string>();
  const chunks = collections.flatMap((collection) => {
    for (const chunk of collection.chunks) collectionIdByChunkId.set(chunk.id, collection.id);
    return collection.chunks;
  });
  const weightOf = (chunk: KnowledgeChunk): number => {
    const collectionId = collectionIdByChunkId.get(chunk.id);
    return collectionId === undefined ? 1 : (weights[collectionId] ?? 1);
  };

  let scored: ScoredChunk[];
  if (hybrid !== undefined) {
    try {
      scored = await hybridScoreChunks(query, chunks, {
        vectorStore: hybrid.vectorStore,
        embeddingGateway: hybrid.embeddingGateway,
        collectionIds,
        weightOf,
      });
    } catch {
      scored = topChunks(query, chunks, chunks.length, weightOf);
    }
  } else {
    scored = topChunks(query, chunks, chunks.length, weightOf);
  }

  return scored.slice(0, limit).map(({ chunk, score }) => ({
    heading: chunk.heading,
    text: chunk.text,
    sourceTitle: chunk.sourceTitle,
    sourceUrl: chunk.sourceUrl,
    fetchedAt: chunk.fetchedAt,
    score,
  }));
}
