/**
 * Deterministic PDF text extraction (Phase O). Pure wrapper around pdf-parse
 * (pdfjs under the hood) -- no OCR, no LLM. A scanned/image-only PDF is
 * explicitly rejected rather than silently producing near-empty chunks
 * (Law 1: never guess) -- API surface verified against the installed
 * pdf-parse@2.4.5 type declarations before writing this file.
 */
import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PdfExtractResult {
  pages: ExtractedPage[];
  totalChars: number;
}

export type PdfExtractOutcome =
  | { ok: true; result: PdfExtractResult }
  | { ok: false; reason: string };

/** Below this average, a PDF is treated as scanned/image-only -- never guessed at via OCR. */
export const MIN_CHARS_PER_PAGE_AVERAGE = 50;

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractOutcome> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const pages: ExtractedPage[] = parsed.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text.trim(),
    }));
    if (pages.length === 0) {
      return { ok: false, reason: 'PDF has no pages.' };
    }
    const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
    const avgCharsPerPage = totalChars / pages.length;
    if (avgCharsPerPage < MIN_CHARS_PER_PAGE_AVERAGE) {
      return {
        ok: false,
        reason:
          `Appears to be a scanned/image PDF (average ${avgCharsPerPage.toFixed(1)} extractable ` +
          `characters/page across ${pages.length} page(s), expected at least ${MIN_CHARS_PER_PAGE_AVERAGE}) ` +
          '-- no OCR is performed here. Upload a text-native PDF, or a text export of this document, instead.',
      };
    }
    return { ok: true, result: { pages, totalChars } };
  } catch (cause) {
    return {
      ok: false,
      reason: `Could not parse this file as a PDF: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  } finally {
    await parser.destroy();
  }
}
