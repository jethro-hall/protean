import type { KnowledgeCollection } from '../../contracts/knowledge.js';

/**
 * Tier-0 "compact doctrine" digest — deterministic extractive summary (Law 4:
 * no generative summarisation, so it can never drift from or embellish beyond
 * the source chunks). One line per chunk: heading + first sentence + citation.
 * Lives in the cacheable system-prompt prefix so repeat turns pay near-zero
 * cost for it (Bedrock/Anthropic prompt cache, already proven in this engine).
 */
const DEFAULT_MAX_SENTENCE_CHARS = 220;

function firstSentence(text: string, maxChars: number): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > maxChars ? `${sentence.slice(0, maxChars - 1)}…` : sentence;
}

export function buildDigest(
  collections: readonly KnowledgeCollection[],
  maxSentenceChars = DEFAULT_MAX_SENTENCE_CHARS,
): string {
  if (collections.length === 0) return '';
  const lines: string[] = [
    'Grounded-knowledge digest (Phase 6 POC — deterministic extract, not model-generated):',
  ];
  for (const collection of collections) {
    lines.push(`### ${collection.displayName}`);
    for (const chunk of collection.chunks) {
      lines.push(
        `- **${chunk.heading}** (${chunk.sourceTitle}, captured ${chunk.fetchedAt}): ` +
          firstSentence(chunk.text, maxSentenceChars),
      );
    }
  }
  lines.push(
    'This digest is a compressed pointer, not the full source — call query_knowledge_base ' +
      'for exact wording, thresholds, or anything the digest does not cover.',
  );
  return lines.join('\n');
}
