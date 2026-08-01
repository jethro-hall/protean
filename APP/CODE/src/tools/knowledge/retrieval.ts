import type { KnowledgeChunk, ScoredChunk } from '../../contracts/knowledge.js';

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
