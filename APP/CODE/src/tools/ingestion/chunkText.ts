/**
 * Deterministic chunking (Phase O) -- code, not the model (Law 4). Splits
 * extracted PDF text into paragraph-grouped chunks satisfying the existing,
 * unchanged knowledgeChunkSchema (contracts/knowledge.ts), so nothing
 * downstream (retrieval, digest) needs to know these chunks came from a PDF
 * rather than a hand-authored JSON file.
 */
import { createHash } from 'node:crypto';
import type { KnowledgeChunk } from '../../contracts/knowledge.js';
import type { ExtractedPage } from './pdfExtract.js';

/** Roughly the point a chunk stops accumulating more paragraphs and gets flushed. */
export const TARGET_CHUNK_CHARS = 1200;
const MAX_HEADING_LINE_CHARS = 80;

interface Paragraph {
  pageNumber: number;
  text: string;
}

/**
 * pdf-parse's getText() emits a single `\n` between lines whenever the
 * vertical gap exceeds its line-detection threshold -- verified empirically
 * (a large gap before a heading and a small gap between body lines both
 * produced exactly one `\n`, never a blank line). Splitting on blank lines
 * would silently treat an entire page as one paragraph, so each line is the
 * atomic unit here, not blank-line-separated blocks.
 */
function splitIntoParagraphs(pages: readonly ExtractedPage[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const page of pages) {
    const lines = page.text
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0);
    for (const text of lines) paragraphs.push({ pageNumber: page.pageNumber, text });
  }
  return paragraphs;
}

/** A short, non-sentence-terminated standalone line is treated as a section heading. */
function looksLikeHeading(text: string): boolean {
  return text.length > 0 && text.length <= MAX_HEADING_LINE_CHARS && !/[.!?]$/.test(text);
}

function firstSentence(text: string, maxChars = 70): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > maxChars ? `${sentence.slice(0, maxChars - 1)}…` : sentence;
}

/** Stable, content-derived id -- deterministic and idempotent across re-ingesting the same document. */
function chunkId(sourceTitle: string, index: number, text: string): string {
  return createHash('sha256').update(`${sourceTitle}::${index}::${text.slice(0, 64)}`).digest('hex').slice(0, 16);
}

export interface ChunkTextOptions {
  sourceTitle: string;
  /** File reference for the uploaded document (not a web URL for PDF ingestion) -- a page anchor is appended per chunk. */
  sourceFileRef: string;
  fetchedAt: string;
}

export function chunkText(pages: readonly ExtractedPage[], options: ChunkTextOptions): KnowledgeChunk[] {
  const paragraphs = splitIntoParagraphs(pages);
  const chunks: KnowledgeChunk[] = [];
  let currentHeading: string | null = null;
  let bufferTexts: string[] = [];
  let bufferStartPage = paragraphs[0]?.pageNumber ?? 1;
  let chunkIndex = 0;

  const flush = (): void => {
    if (bufferTexts.length === 0) return;
    const text = bufferTexts.join('\n\n');
    const heading = currentHeading ?? firstSentence(text);
    chunkIndex += 1;
    chunks.push({
      id: chunkId(options.sourceTitle, chunkIndex, text),
      heading,
      text,
      sourceTitle: options.sourceTitle,
      sourceUrl: `${options.sourceFileRef}#page=${bufferStartPage}`,
      fetchedAt: options.fetchedAt,
    });
    bufferTexts = [];
  };

  for (const paragraph of paragraphs) {
    if (looksLikeHeading(paragraph.text)) {
      flush();
      currentHeading = paragraph.text;
      bufferStartPage = paragraph.pageNumber;
      continue;
    }
    if (bufferTexts.length === 0) bufferStartPage = paragraph.pageNumber;
    bufferTexts.push(paragraph.text);
    const currentLength = bufferTexts.reduce((sum, text) => sum + text.length, 0);
    if (currentLength >= TARGET_CHUNK_CHARS) {
      flush();
      // Continuing content past the target size without a new heading gets its
      // own extractive heading (firstSentence) rather than repeating the last one.
      currentHeading = null;
    }
  }
  flush();
  return chunks;
}
