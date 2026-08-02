import { describe, expect, it } from 'vitest';
import { extractPdfText, MIN_CHARS_PER_PAGE_AVERAGE } from '../src/tools/ingestion/pdfExtract.js';
import { buildScannedLikePdf, buildTestPdf } from './helpers/buildTestPdf.js';

describe('extractPdfText', () => {
  it('extracts real text from a text-native PDF, page by page', async () => {
    const pdf = buildTestPdf([
      [
        { text: 'Introduction', fontSize: 14 },
        { text: 'First page body text here, with enough real words to clear the density check.' },
        { text: 'A second line of real content on the first page as well.' },
      ],
      [
        { text: 'Second page body text here, also with enough real words in it.' },
        { text: 'A second line of real content on the second page as well.' },
      ],
    ]);
    const outcome = await extractPdfText(pdf);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pages).toHaveLength(2);
    expect(outcome.result.pages[0]?.text).toContain('Introduction');
    expect(outcome.result.pages[0]?.text).toContain('First page body text here, with enough real words');
    expect(outcome.result.pages[1]?.text).toContain('Second page body text here, also with enough real words');
    expect(outcome.result.totalChars).toBeGreaterThan(0);
  });

  it('rejects a scanned/image-only PDF with a specific, actionable reason -- never guesses via OCR', async () => {
    const scanned = buildScannedLikePdf(2);
    const outcome = await extractPdfText(scanned);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('scanned/image PDF');
    expect(outcome.reason).toContain(`${MIN_CHARS_PER_PAGE_AVERAGE}`);
    expect(outcome.reason).not.toBe('error');
  });

  it('returns a specific parse-failure reason for a non-PDF buffer, rather than throwing', async () => {
    const garbage = Buffer.from('this is not a pdf at all, just plain bytes');
    const outcome = await extractPdfText(garbage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('Could not parse this file as a PDF');
  });

  it('a PDF with substantial real text per page is accepted', async () => {
    const longParagraph = Array.from({ length: 20 }, (_, i) => ({ text: `Body line number ${i} with real words in it.` }));
    const pdf = buildTestPdf([[{ text: 'Heading', fontSize: 14 }, ...longParagraph]]);
    const outcome = await extractPdfText(pdf);
    expect(outcome.ok).toBe(true);
  });
});
