/**
 * Provider-agnostic vector store (Law 5, ADR-0002/Law 7 seam). The app speaks
 * this ONE internal protocol; the pgvector implementation lives behind it in
 * gateway/vectorStore/pgvectorAdapter.ts -- the only file allowed to import a
 * Postgres client. A future Qdrant adapter (per ADR-0002's own deferral
 * trigger) would implement this same interface, no caller changes required.
 */
export interface ChunkEmbeddingRecord {
  chunkId: string;
  collectionId: string;
  embedding: readonly number[];
  model: string;
}

export interface SimilarityHit {
  chunkId: string;
  /** Cosine similarity in [-1, 1] (already converted from pgvector's distance operator) -- higher is more similar. */
  score: number;
}

export interface VectorStore {
  upsertChunkEmbedding(record: ChunkEmbeddingRecord): Promise<void>;
  similaritySearch(
    queryEmbedding: readonly number[],
    collectionIds: readonly string[],
    limit: number,
  ): Promise<SimilarityHit[]>;
  deleteCollectionEmbeddings(collectionId: string): Promise<void>;
  /** Cheap reachability check -- callers degrade to TF-IDF-only rather than fail the turn (ADR-0003's "optional and degradable" ethos, extended here). */
  isReachable(): Promise<boolean>;
}
