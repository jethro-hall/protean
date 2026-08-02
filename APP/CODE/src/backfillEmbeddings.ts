/**
 * Phase Q one-time backfill: embed every checked-in knowledge chunk into
 * pgvector so hybrid search has real data from day one (rather than only
 * ever seeing embeddings for chunks authored via the Phase P upload flow).
 * Idempotent -- upsertChunkEmbedding is ON CONFLICT DO UPDATE, so re-running
 * this is safe.
 *
 * Usage: npm run backfill-embeddings
 */
import { listKnowledgeCollections, loadKnowledgeCollection } from './config/knowledgeCollections.js';
import { loadConfig } from './config/loadConfig.js';
import { createVoyageEmbeddingGateway } from './gateway/embeddings/voyageAdapter.js';
import { createPgvectorStore } from './gateway/vectorStore/pgvectorAdapter.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { pg, voyageApiKey, embeddingModel } = config.grounding;
  if (pg === undefined || voyageApiKey === undefined) {
    throw new Error(
      'Grounding is not configured (PG_* / VOYAGE_API_KEY env vars) -- nothing to backfill against.',
    );
  }

  const vectorStore = createPgvectorStore(pg);
  const embeddingGateway = createVoyageEmbeddingGateway(voyageApiKey, embeddingModel);

  const collections = listKnowledgeCollections(config.paths.domainsDir).map((entry) =>
    loadKnowledgeCollection(config.paths.domainsDir, entry.id),
  );

  let embedded = 0;
  let totalTokens = 0;
  // One batched embed call per collection (not one call per chunk) -- both
  // more efficient and required in practice: Voyage's free tier caps at 3
  // requests/minute, which one-call-per-chunk blew through immediately.
  for (const collection of collections) {
    if (collection.chunks.length === 0) continue;
    const result = await embeddingGateway.embed({
      texts: collection.chunks.map((chunk) => chunk.text),
      inputType: 'document',
    });
    for (const [index, chunk] of collection.chunks.entries()) {
      const vector = result.embeddings[index];
      if (vector === undefined) {
        throw new Error(`Voyage returned no vector for chunk ${chunk.id}`);
      }
      await vectorStore.upsertChunkEmbedding({
        chunkId: chunk.id,
        collectionId: collection.id,
        embedding: vector,
        model: result.model,
      });
      embedded += 1;
      process.stdout.write(`embedded ${collection.id}/${chunk.id}\n`);
    }
    totalTokens += result.totalTokens;
  }

  process.stdout.write(
    `\nBackfill complete: ${embedded} chunks across ${collections.length} collections, ${totalTokens} total tokens.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`Backfill failed: ${String(error)}\n`);
    process.exit(1);
  });
