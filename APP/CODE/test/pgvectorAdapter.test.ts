import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgvectorStore } from '../src/gateway/vectorStore/pgvectorAdapter.js';
import type { VectorStore } from '../src/contracts/vectorStore.js';
import { loadDotEnv } from '../src/config/env.js';

/**
 * Real integration test against the actual protean-pg container (Phase M) --
 * no mocks, matching this project's evidence-based convention. Skips (not
 * fails) when the DB isn't reachable, mirroring the adapter's own
 * "optional and degradable" design -- CI/other environments without
 * `docker compose up protean-pg` running still pass the suite.
 */
loadDotEnv();

const pgConfig = {
  host: process.env.PG_HOST ?? '127.0.0.1',
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? '',
  password: process.env.PG_PASSWORD ?? '',
  database: process.env.PG_DB ?? '',
};

let store: VectorStore;
let dbAvailable = false;

beforeAll(async () => {
  if (pgConfig.user === '' || pgConfig.password === '' || pgConfig.database === '') {
    dbAvailable = false;
    return;
  }
  store = createPgvectorStore(pgConfig);
  dbAvailable = await store.isReachable();
});

afterAll(async () => {
  if (dbAvailable) {
    await store.deleteCollectionEmbeddings('pgvector-adapter-test');
  }
});

describe.skipIf(!process.env.PG_HOST)('createPgvectorStore (real Postgres integration)', () => {
  it('reports reachable against a real running instance', async () => {
    expect(dbAvailable).toBe(true);
  });

  it('upserts an embedding then finds it as its own nearest neighbour', async () => {
    if (!dbAvailable) return;
    const vector = Array.from({ length: 1024 }, (_, i) => Math.sin(i));
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-a',
      collectionId: 'pgvector-adapter-test',
      embedding: vector,
      model: 'test-model',
    });
    const hits = await store.similaritySearch(vector, ['pgvector-adapter-test'], 5);
    expect(hits[0]?.chunkId).toBe('pgvector-test-a');
    expect(hits[0]?.score).toBeCloseTo(1, 5);
  });

  it('ranks a near-identical vector above an orthogonal-ish one', async () => {
    if (!dbAvailable) return;
    const base = Array.from({ length: 1024 }, (_, i) => Math.sin(i));
    const near = base.map((v) => v + 0.001);
    const far = Array.from({ length: 1024 }, (_, i) => Math.cos(i * 3));
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-near',
      collectionId: 'pgvector-adapter-test',
      embedding: near,
      model: 'test-model',
    });
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-far',
      collectionId: 'pgvector-adapter-test',
      embedding: far,
      model: 'test-model',
    });
    const hits = await store.similaritySearch(base, ['pgvector-adapter-test'], 10);
    const nearIndex = hits.findIndex((h) => h.chunkId === 'pgvector-test-near');
    const farIndex = hits.findIndex((h) => h.chunkId === 'pgvector-test-far');
    expect(nearIndex).toBeGreaterThanOrEqual(0);
    expect(farIndex).toBeGreaterThanOrEqual(0);
    expect(nearIndex).toBeLessThan(farIndex);
  });

  it('upsert overwrites an existing chunk id rather than duplicating it', async () => {
    if (!dbAvailable) return;
    const v1 = Array.from({ length: 1024 }, () => 0);
    const v2 = Array.from({ length: 1024 }, () => 1);
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-overwrite',
      collectionId: 'pgvector-adapter-test',
      embedding: v1,
      model: 'model-a',
    });
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-overwrite',
      collectionId: 'pgvector-adapter-test',
      embedding: v2,
      model: 'model-b',
    });
    const hits = await store.similaritySearch(v2, ['pgvector-adapter-test'], 1);
    expect(hits[0]?.chunkId).toBe('pgvector-test-overwrite');
    expect(hits[0]?.score).toBeCloseTo(1, 5);
  });

  it('similaritySearch scopes results to the requested collection ids only', async () => {
    if (!dbAvailable) return;
    const v = Array.from({ length: 1024 }, () => 0.5);
    await store.upsertChunkEmbedding({
      chunkId: 'pgvector-test-other-collection',
      collectionId: 'pgvector-adapter-test-unrelated',
      embedding: v,
      model: 'test-model',
    });
    const hits = await store.similaritySearch(v, ['pgvector-adapter-test'], 10);
    expect(hits.some((h) => h.chunkId === 'pgvector-test-other-collection')).toBe(false);
    await store.deleteCollectionEmbeddings('pgvector-adapter-test-unrelated');
  });

  it('deleteCollectionEmbeddings removes everything in that collection', async () => {
    if (!dbAvailable) return;
    await store.deleteCollectionEmbeddings('pgvector-adapter-test');
    const hits = await store.similaritySearch(
      Array.from({ length: 1024 }, () => 0),
      ['pgvector-adapter-test'],
      10,
    );
    expect(hits).toEqual([]);
  });

  it('isReachable returns false for an unreachable host, not a thrown error', async () => {
    const deadStore = createPgvectorStore({ ...pgConfig, host: '127.0.0.1', port: 1 });
    await expect(deadStore.isReachable()).resolves.toBe(false);
  });
});
