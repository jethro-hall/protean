import { loadKnowledgeCollections } from '../../config/knowledgeCollections.js';
import { topChunks } from '../knowledge/retrieval.js';

export interface KnowledgeQueryHit {
  heading: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  fetchedAt: string;
  score: number;
}

/**
 * Tier-1 on-demand retrieval (Law 4: deterministic, no LLM). Called only when
 * the model decides the Tier-0 digest isn't enough — exact wording, a figure,
 * an edge case. Collections are the same curated corpus the digest was built
 * from, so nothing here can disagree with the digest's citations.
 */
export function queryKnowledgeBase(
  domainsDir: string,
  collectionIds: readonly string[],
  query: string,
  limit = 5,
): KnowledgeQueryHit[] {
  const collections = loadKnowledgeCollections(domainsDir, collectionIds);
  const chunks = collections.flatMap((collection) => collection.chunks);
  return topChunks(query, chunks, limit).map(({ chunk, score }) => ({
    heading: chunk.heading,
    text: chunk.text,
    sourceTitle: chunk.sourceTitle,
    sourceUrl: chunk.sourceUrl,
    fetchedAt: chunk.fetchedAt,
    score,
  }));
}
