/**
 * LLM oversight check (owner-directed, "make sure the juice is worth the
 * squeeze -- dependable, consistent, perfect"): before a human ever reviews
 * proposed headings/summaries, an LLM independently compares the deterministic
 * extraction+chunking output against the ORIGINAL raw page text and flags any
 * specific fact, figure, name, or claim present in the source but absent from
 * every chunk -- exactly the class of bug a heuristic chunker can introduce
 * (live-caught: a mis-classified "heading" line silently swallowing real
 * content). This is a CHECK, not a source of truth (Law 4) -- it never edits
 * chunks, only flags discrepancies for a human to look at before saving.
 */
import { chunkFidelityReportSchema, type ChunkFidelityReport } from '../../contracts/authoring.js';
import type { KnowledgeChunk } from '../../contracts/knowledge.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { ExtractedPage } from '../ingestion/pdfExtract.js';
import { extractJsonObject } from './jsonFromModel.js';

const SYSTEM_PROMPT =
  'You are a completeness auditor, not an author. Compare SOURCE TEXT (the raw extracted document) ' +
  'against CHUNKED OUTPUT (what a deterministic chunker produced from it). List any specific fact, ' +
  'figure, name, date, or claim that appears in the source but is NOT present anywhere in the chunked ' +
  'output -- these indicate the chunker lost content. Separately list anything in the chunked output ' +
  'that does not appear to come from the source at all -- these indicate corruption, not omission. Be ' +
  'precise and concrete (quote the missing/suspicious text); do not flag paraphrasing, reordering, or ' +
  'messy/run-on headings -- only genuinely ABSENT or ADDED substantive content. Respond with ONLY a ' +
  'JSON object of this exact shape: {"verdict": "clean" | "issues-found", "missingFacts": ["..."], ' +
  '"suspiciousAdditions": ["..."]}. No prose, no markdown code fences -- the JSON object only.';

function renderForPrompt(pages: readonly ExtractedPage[], chunks: readonly KnowledgeChunk[]): string {
  const source = pages.map((page) => `[page ${page.pageNumber}]\n${page.text}`).join('\n\n');
  const chunked = chunks
    .map((chunk, i) => `--- Chunk ${i + 1} ---\nHeading: ${chunk.heading}\nText: ${chunk.text}`)
    .join('\n\n');
  return `SOURCE TEXT:\n${source}\n\nCHUNKED OUTPUT:\n${chunked}`;
}

export async function verifyChunkFidelity(
  gateway: LlmGateway,
  model: string,
  pages: readonly ExtractedPage[],
  chunks: readonly KnowledgeChunk[],
  log: LayerLogger,
): Promise<ChunkFidelityReport> {
  if (chunks.length === 0) return { verdict: 'clean', missingFacts: [], suspiciousAdditions: [] };

  let raw = '';
  let failed: string | null = null;
  for await (const event of gateway.streamTurn({
    turnId: `authoring-fidelity-${Date.now()}`,
    model,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderForPrompt(pages, chunks) }],
  })) {
    if (event.type === 'text') raw += event.text;
    if (event.type === 'error') failed = event.message;
  }
  if (failed !== null) {
    throw new Error(`Chunk fidelity check failed: ${failed}`);
  }

  try {
    return chunkFidelityReportSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (cause) {
    log.warn('authoring.fidelity.parse_failed', 'Model did not return valid fidelity-report JSON', {
      data: { raw: raw.slice(0, 500) },
    });
    throw new Error(
      `Model did not return valid fidelity-report JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
