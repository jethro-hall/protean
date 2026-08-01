import { describe, expect, it } from 'vitest';
import type { KnowledgeChunk } from '../src/contracts/knowledge.js';
import { scoreChunks, topChunks } from '../src/tools/knowledge/retrieval.js';
import { buildDigest } from '../src/tools/knowledge/digest.js';

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
