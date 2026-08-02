/**
 * LLM-assisted per-chunk heading/summary proposal (Phase P). The model sees
 * ONLY each chunk's own text, is instructed never to draw on another chunk or
 * general knowledge, and every proposal is returned paired with its source
 * chunkId so the GUI can render it next to the literal source for human
 * review -- nothing here saves anything (Law 4: deterministic before
 * generative -- the model organizes/labels, it never becomes the source of a
 * fact; the extracted chunk text is).
 */
import { chunkProposalBatchSchema, type ChunkProposal } from '../../contracts/authoring.js';
import type { KnowledgeChunk } from '../../contracts/knowledge.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { LayerLogger } from '../../logging/logger.js';
import { extractJsonObject } from './jsonFromModel.js';

const SYSTEM_PROMPT =
  'You propose a concise heading (max 80 characters) and a one-sentence summary for each numbered ' +
  'source chunk below. Use ONLY facts stated in that exact chunk -- never add information from ' +
  'another chunk, from general knowledge, or invent anything not present in the text. Respond with ' +
  'ONLY a JSON object of this exact shape: {"proposals": [{"chunkId": "...", "heading": "...", ' +
  '"summary": "..."}, ...]}, one entry per chunk, matching each chunkId exactly. No prose, no ' +
  'markdown code fences, no explanation -- the JSON object only.';

export interface ProposeChunkMetadataResult {
  proposals: ChunkProposal[];
  warnings: string[];
}

function renderChunksForPrompt(chunks: readonly KnowledgeChunk[]): string {
  return chunks.map((chunk, i) => `--- Chunk ${i + 1} (chunkId: ${chunk.id}) ---\n${chunk.text}`).join('\n\n');
}

export async function proposeChunkMetadata(
  gateway: LlmGateway,
  model: string,
  chunks: readonly KnowledgeChunk[],
  log: LayerLogger,
): Promise<ProposeChunkMetadataResult> {
  if (chunks.length === 0) return { proposals: [], warnings: [] };

  let raw = '';
  let failed: string | null = null;
  for await (const event of gateway.streamTurn({
    turnId: `authoring-chunks-${Date.now()}`,
    model,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderChunksForPrompt(chunks) }],
  })) {
    if (event.type === 'text') raw += event.text;
    if (event.type === 'error') failed = event.message;
  }
  if (failed !== null) {
    throw new Error(`Chunk metadata proposal failed: ${failed}`);
  }

  let parsed;
  try {
    parsed = chunkProposalBatchSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (cause) {
    log.warn('authoring.propose.parse_failed', 'Model did not return valid proposal JSON', {
      data: { raw: raw.slice(0, 500) },
    });
    throw new Error(
      `Model did not return valid proposal JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const knownIds = new Set(chunks.map((chunk) => chunk.id));
  const warnings: string[] = [];
  const proposals = parsed.proposals.filter((proposal) => {
    if (knownIds.has(proposal.chunkId)) return true;
    warnings.push(`Model proposed chunkId "${proposal.chunkId}" that doesn't match any input chunk -- discarded.`);
    return false;
  });
  const proposedIds = new Set(proposals.map((proposal) => proposal.chunkId));
  for (const chunk of chunks) {
    if (!proposedIds.has(chunk.id)) {
      warnings.push(`No proposal returned for chunk "${chunk.heading}" (${chunk.id}) -- its extractive heading is kept as-is.`);
    }
  }
  return { proposals, warnings };
}
