import { describe, expect, it } from 'vitest';
import type { KnowledgeChunk } from '../src/contracts/knowledge.js';
import { hybridScoreChunks, scoreChunks, topChunks } from '../src/tools/knowledge/retrieval.js';
import { buildDigest } from '../src/tools/knowledge/digest.js';
import type { EmbeddingGateway } from '../src/gateway/embeddings/EmbeddingGateway.js';
import type { VectorStore } from '../src/contracts/vectorStore.js';

function chunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: 'c1',
    heading: 'Heading',
    text: 'Some text.',
    sourceTitle: 'Source',
    sourceUrl: 'https://example.com',
    fetchedAt: '2026-08-01',
    ...overrides,
  };
}

describe('scoreChunks', () => {
  it('returns nothing for an empty query or empty corpus', () => {
    expect(scoreChunks('', [chunk()])).toEqual([]);
    expect(scoreChunks('threshold', [])).toEqual([]);
  });

  it('ranks a chunk that matches query terms above one that does not', () => {
    const relevant = chunk({
      id: 'relevant',
      heading: 'Notional deduction threshold',
      text: 'Entities must incur at least $20,000 in notional deductions annually.',
    });
    const unrelated = chunk({ id: 'unrelated', heading: 'Excluded expenditure', text: 'Tax agent fees are excluded.' });
    const scored = scoreChunks('what is the notional deduction threshold', [unrelated, relevant]);
    expect(scored[0]?.chunk.id).toBe('relevant');
    expect(scored.every((entry) => entry.score > 0)).toBe(true);
  });

  it('is deterministic — same query and corpus always produce the same order', () => {
    const chunks = [
      chunk({ id: 'a', heading: 'Salary expenditure', text: 'Salaries and wages for R&D staff.' }),
      chunk({ id: 'b', heading: 'Depreciating assets', text: 'Decline in value of R&D assets.' }),
    ];
    const first = scoreChunks('salary wages', chunks);
    const second = scoreChunks('salary wages', chunks);
    expect(first.map((entry) => entry.chunk.id)).toEqual(second.map((entry) => entry.chunk.id));
  });

  it('topChunks caps results to the requested limit', () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      chunk({ id: `c${i}`, heading: 'Threshold', text: 'threshold threshold threshold' }),
    );
    expect(topChunks('threshold', chunks, 3)).toHaveLength(3);
  });
});

describe('scoreChunks / topChunks weighting (Phase 6 knowledge-base weighting)', () => {
  it('a higher weightOf multiplier reorders an otherwise-tied result to the top', () => {
    const a = chunk({ id: 'a', heading: 'Threshold', text: 'threshold applies here' });
    const b = chunk({ id: 'b', heading: 'Threshold', text: 'threshold applies here' });
    // Identical text -> identical base score; only the weight differs.
    const unweighted = scoreChunks('threshold', [a, b]);
    expect(unweighted[0]?.score).toBe(unweighted[1]?.score);

    const weighted = scoreChunks('threshold', [a, b], (chunkArg) => (chunkArg.id === 'b' ? 5 : 1));
    expect(weighted[0]?.chunk.id).toBe('b');
    expect(weighted[0]?.score).toBeGreaterThan(weighted[1]?.score ?? 0);
  });

  it('defaults every chunk to weight 1 (no reordering) when weightOf is omitted', () => {
    const chunks = [
      chunk({ id: 'a', heading: 'Threshold', text: 'threshold applies here' }),
      chunk({ id: 'b', heading: 'Threshold', text: 'threshold applies here twice as much' }),
    ];
    expect(scoreChunks('threshold', chunks)).toEqual(scoreChunks('threshold', chunks, () => 1));
  });

  it('topChunks threads weightOf through before slicing to the limit', () => {
    const low = chunk({ id: 'low', heading: 'Threshold', text: 'threshold once' });
    const high = chunk({ id: 'high', heading: 'Threshold', text: 'threshold once' });
    const top = topChunks('threshold', [low, high], 1, (chunkArg) => (chunkArg.id === 'high' ? 10 : 1));
    expect(top).toHaveLength(1);
    expect(top[0]?.chunk.id).toBe('high');
  });
});

describe('buildDigest', () => {
  it('returns an empty string for no collections', () => {
    expect(buildDigest([])).toBe('');
  });

  it('extracts one line per chunk with heading, source, and first sentence only', () => {
    const digest = buildDigest([
      {
        id: 'col-1',
        displayName: 'Test Collection',
        chunks: [
          chunk({
            heading: 'Core R&D activities',
            text: 'First sentence here. Second sentence should not appear.',
            sourceTitle: 'ATO guidance',
          }),
        ],
      },
    ]);
    expect(digest).toContain('Test Collection');
    expect(digest).toContain('Core R&D activities');
    expect(digest).toContain('First sentence here.');
    expect(digest).not.toContain('Second sentence should not appear.');
    expect(digest).toContain('ATO guidance');
  });

  it('clips an overlong first sentence to maxSentenceChars', () => {
    const longSentence = `${'a'.repeat(300)}.`;
    const digest = buildDigest(
      [{ id: 'col-1', displayName: 'Test', chunks: [chunk({ text: longSentence })] }],
      50,
    );
    expect(digest).toContain('…');
    const line = digest.split('\n').find((l) => l.includes('aaa'));
    expect(line?.length).toBeLessThan(120);
  });
});

function fakeEmbeddingGateway(vector: number[]): EmbeddingGateway {
  return {
    provider: 'fake',
    async embed() {
      return { embeddings: [vector], model: 'fake-model', totalTokens: 1 };
    },
  };
}

function fakeVectorStore(hits: Array<{ chunkId: string; score: number }>): VectorStore {
  return {
    async upsertChunkEmbedding() {},
    async similaritySearch() {
      return hits;
    },
    async deleteCollectionEmbeddings() {},
    async isReachable() {
      return true;
    },
  };
}

describe('hybridScoreChunks (Phase Q — TF-IDF + vector similarity via RRF)', () => {
  it('includes a chunk found only by vector search (no keyword overlap) alongside a keyword-only match', async () => {
    const keywordChunk = chunk({ id: 'keyword-match', heading: 'Threshold', text: 'threshold applies here' });
    const semanticChunk = chunk({ id: 'semantic-match', heading: 'Unrelated words', text: 'zzz yyy xxx' });
    const result = await hybridScoreChunks('threshold', [keywordChunk, semanticChunk], {
      vectorStore: fakeVectorStore([{ chunkId: 'semantic-match', score: 0.9 }]),
      embeddingGateway: fakeEmbeddingGateway([0.1, 0.2]),
      collectionIds: ['col-1'],
    });
    const ids = result.map((entry) => entry.chunk.id);
    expect(ids).toContain('keyword-match');
    expect(ids).toContain('semantic-match');
  });

  it('a chunk ranked first in both the keyword and vector rankings ends up first in the fused result', async () => {
    const top = chunk({ id: 'top', heading: 'Threshold', text: 'threshold threshold threshold' });
    const other = chunk({ id: 'other', heading: 'Threshold', text: 'threshold once' });
    const result = await hybridScoreChunks('threshold', [top, other], {
      vectorStore: fakeVectorStore([
        { chunkId: 'top', score: 0.95 },
        { chunkId: 'other', score: 0.4 },
      ]),
      embeddingGateway: fakeEmbeddingGateway([0.1, 0.2]),
      collectionIds: ['col-1'],
    });
    expect(result[0]?.chunk.id).toBe('top');
  });

  it('ignores a vector hit for a chunkId outside this turn\'s corpus (stale/foreign row), not trusted blind', async () => {
    const only = chunk({ id: 'only', heading: 'Threshold', text: 'threshold applies here' });
    const result = await hybridScoreChunks('threshold', [only], {
      vectorStore: fakeVectorStore([
        { chunkId: 'only', score: 0.5 },
        { chunkId: 'not-in-this-turn', score: 0.99 },
      ]),
      embeddingGateway: fakeEmbeddingGateway([0.1, 0.2]),
      collectionIds: ['col-1'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.chunk.id).toBe('only');
  });

  it('applies the collection weight to the keyword-ranking component before fusion', async () => {
    const a = chunk({ id: 'a', heading: 'Threshold', text: 'threshold applies here' });
    const b = chunk({ id: 'b', heading: 'Threshold', text: 'threshold applies here' });
    const result = await hybridScoreChunks('threshold', [a, b], {
      vectorStore: fakeVectorStore([]),
      embeddingGateway: fakeEmbeddingGateway([0.1, 0.2]),
      collectionIds: ['col-1'],
      weightOf: (c) => (c.id === 'b' ? 5 : 1),
    });
    expect(result[0]?.chunk.id).toBe('b');
  });

  it('is deterministic — identical inputs produce identical ordering across separate calls', async () => {
    const chunks = [
      chunk({ id: 'a', heading: 'Threshold', text: 'threshold applies here' }),
      chunk({ id: 'b', heading: 'Threshold', text: 'threshold once mentioned' }),
    ];
    const opts = {
      vectorStore: fakeVectorStore([{ chunkId: 'b', score: 0.8 }]),
      embeddingGateway: fakeEmbeddingGateway([0.1, 0.2]),
      collectionIds: ['col-1'],
    };
    const first = await hybridScoreChunks('threshold', chunks, opts);
    const second = await hybridScoreChunks('threshold', chunks, opts);
    expect(first.map((e) => e.chunk.id)).toEqual(second.map((e) => e.chunk.id));
  });

  it('throws when the embedding gateway returns no vector, letting the caller degrade to TF-IDF', async () => {
    const emptyGateway: EmbeddingGateway = {
      provider: 'fake',
      async embed() {
        return { embeddings: [], model: 'fake-model', totalTokens: 0 };
      },
    };
    await expect(
      hybridScoreChunks('threshold', [chunk()], {
        vectorStore: fakeVectorStore([]),
        embeddingGateway: emptyGateway,
        collectionIds: ['col-1'],
      }),
    ).rejects.toThrow(/no vector/);
  });
});
