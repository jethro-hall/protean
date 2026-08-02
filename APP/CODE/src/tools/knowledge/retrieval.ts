import type { KnowledgeChunk, ScoredChunk } from '../../contracts/knowledge.js';
import type { EmbeddingGateway } from '../../gateway/embeddings/EmbeddingGateway.js';
import type { VectorStore } from '../../contracts/vectorStore.js';

/**
 * Deterministic TF-IDF-style term-overlap retrieval (Law 4: deterministic before
 * generative). This is a keyword scorer, not semantic embeddings — the target
 * architecture (docs/INFRASTRUCTURE.md §4.2, pgvector/Qdrant) is unbuilt; this is
 * the honest first cut, upgradeable later without changing the pack-facing contract.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Score every chunk against a query. Empty query or corpus scores nothing. */
export function scoreChunks(
  query: string,
  chunks: readonly KnowledgeChunk[],
  /** Per-collection relevance multiplier (Phase 6 weighting) — defaults to 1 (no effect) when omitted. */
  weightOf?: (chunk: KnowledgeChunk) => number,
): ScoredChunk[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const chunkTermLists = chunks.map((chunk) => tokenize(`${chunk.heading} ${chunk.text}`));
  const docFreq = new Map<string, number>();
  for (const terms of chunkTermLists) {
    for (const term of new Set(terms)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }
  const corpusSize = chunks.length;

  const scored = chunks.map((chunk, index) => {
    const terms = chunkTermLists[index] ?? [];
    const termCounts = new Map<string, number>();
    for (const term of terms) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);

    let score = 0;
    for (const queryTerm of queryTerms) {
      const termFrequency = termCounts.get(queryTerm) ?? 0;
      if (termFrequency === 0) continue;
      const documentFrequency = docFreq.get(queryTerm) ?? 1;
      const inverseDocFrequency = Math.log((corpusSize + 1) / documentFrequency) + 1;
      score += termFrequency * inverseDocFrequency;
    }
    const lengthNorm = Math.sqrt(terms.length || 1);
    const weight = weightOf?.(chunk) ?? 1;
    return { chunk, score: (score / lengthNorm) * weight };
  });

  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
}

/** Top-N scored chunks across one or more collections, already flattened. */
export function topChunks(
  query: string,
  chunks: readonly KnowledgeChunk[],
  limit = 5,
  weightOf?: (chunk: KnowledgeChunk) => number,
): ScoredChunk[] {
  return scoreChunks(query, chunks, weightOf).slice(0, limit);
}

/** Standard constant from the published Reciprocal Rank Fusion literature — dampens any one rank position's influence. */
const RRF_K = 60;

export interface HybridScoreOptions {
  vectorStore: VectorStore;
  embeddingGateway: EmbeddingGateway;
  collectionIds: readonly string[];
  /** Per-collection relevance multiplier (Phase 6 weighting) — applied to the keyword ranking only; RRF then blends it in. */
  weightOf?: (chunk: KnowledgeChunk) => number;
}

/**
 * TF-IDF + vector similarity via Reciprocal Rank Fusion (Phase Q). Keyword
 * scoring alone misses paraphrases; vector scoring alone is weak on exact
 * terms/figures. RRF blends the two RANKINGS (not their raw, incompatible
 * score scales) — the standard, well-published technique for exactly this
 * problem, with no new tuning surface. Throws on failure (embedding call or
 * vector store unreachable) — the caller (queryKnowledgeBase) catches this
 * and degrades to pure TF-IDF, never a hard turn failure.
 */
export async function hybridScoreChunks(
  query: string,
  chunks: readonly KnowledgeChunk[],
  options: HybridScoreOptions,
): Promise<ScoredChunk[]> {
  const keywordRanked = scoreChunks(query, chunks, options.weightOf);

  const queryEmbedding = await options.embeddingGateway.embed({ texts: [query], inputType: 'query' });
  const vector = queryEmbedding.embeddings[0];
  if (vector === undefined) {
    throw new Error('Embedding gateway returned no vector for the query.');
  }
  const vectorHits = await options.vectorStore.similaritySearch(vector, options.collectionIds, chunks.length);

  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const rrfScores = new Map<string, number>();
  keywordRanked.forEach((entry, rank) => {
    rrfScores.set(entry.chunk.id, (rrfScores.get(entry.chunk.id) ?? 0) + 1 / (RRF_K + rank + 1));
  });
  vectorHits.forEach((hit, rank) => {
    // A hit for a chunk not in this turn's corpus (a stale/foreign embedding row) is skipped, not trusted blind.
    if (!chunkById.has(hit.chunkId)) return;
    rrfScores.set(hit.chunkId, (rrfScores.get(hit.chunkId) ?? 0) + 1 / (RRF_K + rank + 1));
  });

  return [...rrfScores.entries()]
    .map(([chunkId, score]) => ({ chunk: chunkById.get(chunkId)!, score }))
    .sort((a, b) => b.score - a.score);
}
