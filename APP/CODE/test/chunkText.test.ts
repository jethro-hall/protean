import { describe, expect, it } from 'vitest';
import { knowledgeChunkSchema } from '../src/contracts/knowledge.js';
import { chunkText, TARGET_CHUNK_CHARS } from '../src/tools/ingestion/chunkText.js';
import type { ExtractedPage } from '../src/tools/ingestion/pdfExtract.js';

const options = { sourceTitle: 'Test Doc', sourceFileRef: 'test.pdf', fetchedAt: '2026-08-01' };

describe('chunkText', () => {
  it('groups body lines under the short heading that precedes them', () => {
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1,
        text: 'Introduction\nThis is the first paragraph of body text.\nIt continues on a second line here.\nEligibility\nThis is a second section with its own paragraph text.',
      },
    ];
    const chunks = chunkText(pages, options);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.heading).toBe('Introduction');
    expect(chunks[0]?.text).toContain('first paragraph');
    expect(chunks[0]?.text).toContain('second line');
    expect(chunks[1]?.heading).toBe('Eligibility');
    expect(chunks[1]?.text).toContain('second section');
  });

  it('every produced chunk satisfies the existing, unchanged knowledgeChunkSchema', () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: 'Heading One\nSome real body content that is not a heading.' },
    ];
    const chunks = chunkText(pages, options);
    for (const chunk of chunks) {
      expect(() => knowledgeChunkSchema.parse(chunk)).not.toThrow();
    }
  });

  it('falls back to an extractive first-sentence heading when no heading-shaped line precedes the content', () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: 'This is a long sentence with no preceding short heading line at all. More text follows.' },
    ];
    const chunks = chunkText(pages, options);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toContain('This is a long sentence');
  });

  it('flushes a new chunk once accumulated text reaches the target size, even under one heading', () => {
    const longLines = Array.from({ length: 40 }, (_, i) => `Line ${i} with enough words to add real length to this paragraph body.`);
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: `Big Section\n${longLines.join('\n')}` }];
    const chunks = chunkText(pages, options);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.heading).toBe('Big Section');
    expect(chunks[0]?.text.length).toBeGreaterThanOrEqual(TARGET_CHUNK_CHARS * 0.5);
  });

  it('is deterministic -- identical input produces identical chunk ids across separate calls (idempotent re-ingestion)', () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: 'Heading\nSome stable content here.' }];
    const first = chunkText(pages, options);
    const second = chunkText(pages, options);
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it('records the starting page number in sourceUrl as a page anchor', () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: 'Page One Heading\nPage one content.' },
      { pageNumber: 2, text: 'Page Two Heading\nPage two content.' },
    ];
    const chunks = chunkText(pages, options);
    expect(chunks[0]?.sourceUrl).toBe('test.pdf#page=1');
    expect(chunks[1]?.sourceUrl).toBe('test.pdf#page=2');
  });

  it('returns an empty array for pages with no extractable lines', () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: '' }];
    expect(chunkText(pages, options)).toEqual([]);
  });
});
