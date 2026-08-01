/**
 * Deterministic citation-fabrication audit (Law 4 + Law 6). A prompt instruction
 * (CITATION_HONESTY_PROTOCOL_PROMPT) is prevention, not proof — generative output
 * can still drift, and did (2026-08-01: the model tried "official knowledge base",
 * then — after the prompt fix — "the same ATO knowledge base sourced in the
 * codebase" instead, while Grep/Glob/Read ran but no knowledge-base tool did).
 * This is the permanent, pack-agnostic safety net. Each claim category is checked
 * against whether a tool call that could actually back THAT specific claim ran —
 * "any tool ran" is not enough, since unrelated tool calls don't corroborate a
 * knowledge-base-specific claim.
 */
interface ProvenanceClaim {
  pattern: RegExp;
  /** A tool name must contain one of these (case-insensitive) to corroborate this claim. */
  corroboratingNameFragments: readonly string[];
}

const PROVENANCE_CLAIMS: readonly ProvenanceClaim[] = [
  {
    pattern: /\b(?:official |the |our )?knowledge base\b/i,
    corroboratingNameFragments: ['knowledge_base', 'knowledgebase'],
  },
  {
    pattern: /\b(?:according to (?:the |our )?)?(?:official |our )?database\b/i,
    corroboratingNameFragments: ['knowledge_base', 'knowledgebase', 'datalake', 'data_lake'],
  },
  {
    pattern: /\bretrieved from\b/i,
    corroboratingNameFragments: [], // generic enough that any real tool call corroborates it
  },
  {
    pattern: /\blooked up\b/i,
    corroboratingNameFragments: [],
  },
];

function isCorroborated(fragments: readonly string[], toolsCalled: readonly string[]): boolean {
  if (fragments.length === 0) return toolsCalled.length > 0;
  const lowerTools = toolsCalled.map((name) => name.toLowerCase());
  return fragments.some((fragment) => lowerTools.some((name) => name.includes(fragment)));
}

/**
 * Returns the exact matched phrases that assert a lookup happened when the turn's
 * own tool-call record can't back that specific claim.
 */
export function findUnverifiedProvenanceClaims(
  output: string,
  toolsCalled: readonly string[],
): string[] {
  const hits: string[] = [];
  for (const claim of PROVENANCE_CLAIMS) {
    const match = claim.pattern.exec(output);
    if (match === null) continue;
    if (isCorroborated(claim.corroboratingNameFragments, toolsCalled)) continue;
    hits.push(match[0]);
  }
  return hits;
}
