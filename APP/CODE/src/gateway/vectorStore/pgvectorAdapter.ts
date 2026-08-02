/**
 * pgvector adapter for VectorStore (ADR-0002) -- the ONLY file in this repo
 * allowed to import a Postgres client (Law 5). Cosine distance via pgvector's
 * `<=>` operator; vectors are passed as pgvector's text literal format
 * (`[v1,v2,...]`) since node-postgres has no native vector type support.
 */
import { Pool } from 'pg';
import type {
  ChunkEmbeddingRecord,
  SimilarityHit,
  VectorStore,
} from '../../contracts/vectorStore.js';
import type { PgConnectionConfig } from '../../contracts/grounding.js';

export type PgvectorConfig = PgConnectionConfig;

function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}

export function createPgvectorStore(config: PgvectorConfig): VectorStore {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 5,
    connectionTimeoutMillis: 3000,
  });

  return {
    async upsertChunkEmbedding(record: ChunkEmbeddingRecord): Promise<void> {
      await pool.query(
        `INSERT INTO knowledge_chunk_embeddings (chunk_id, collection_id, embedding, model)
         VALUES ($1, $2, $3::vector, $4)
         ON CONFLICT (chunk_id) DO UPDATE SET
           collection_id = EXCLUDED.collection_id,
           embedding = EXCLUDED.embedding,
           model = EXCLUDED.model,
           created_at = now()`,
        [record.chunkId, record.collectionId, toVectorLiteral(record.embedding), record.model],
      );
    },

    async similaritySearch(
      queryEmbedding: readonly number[],
      collectionIds: readonly string[],
      limit: number,
    ): Promise<SimilarityHit[]> {
      if (collectionIds.length === 0) return [];
      const result = await pool.query<{ chunk_id: string; distance: number }>(
        `SELECT chunk_id, embedding <=> $1::vector AS distance
         FROM knowledge_chunk_embeddings
         WHERE collection_id = ANY($2::text[])
         ORDER BY distance ASC
         LIMIT $3`,
        [toVectorLiteral(queryEmbedding), collectionIds, limit],
      );
      return result.rows.map((row) => ({
        chunkId: row.chunk_id,
        score: 1 - row.distance,
      }));
    },

    async deleteCollectionEmbeddings(collectionId: string): Promise<void> {
      await pool.query('DELETE FROM knowledge_chunk_embeddings WHERE collection_id = $1', [
        collectionId,
      ]);
    },

    async isReachable(): Promise<boolean> {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}
