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
