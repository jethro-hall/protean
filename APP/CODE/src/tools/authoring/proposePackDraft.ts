/**
 * LLM-assisted pack-level draft (Phase P) -- system prompt, display name,
 * vocabulary. Deliberately takes only already-human-reviewed headings/
 * summaries as input (not raw chunk text or raw first-draft LLM output), so
 * whatever the caller passes in has already been through one round of
 * verification against the real source before this second call runs.
 */
import { packDraftProposalSchema, type PackDraftProposal } from '../../contracts/authoring.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import { extractJsonObject } from './jsonFromModel.js';

const SYSTEM_PROMPT =
  'You propose a domain-pack draft (a display name, a system prompt, and a short vocabulary ' +
  'glossary) based ONLY on the section headings and summaries given below, which were extracted ' +
  "from a real uploaded document and already human-reviewed. Do not invent facts beyond what these " +
  "headings and summaries imply about the domain's subject matter and terminology -- the system " +
  'prompt should describe a persona suited to this subject matter, not assert specific facts from ' +
  'it. Respond with ONLY a JSON object of this exact shape: {"displayName": "...", "systemPrompt": ' +
  '"...", "vocabulary": {"term": "meaning", ...}}. No prose, no markdown code fences.';

export interface ProposePackDraftInput {
  documentTitle: string;
  sections: ReadonlyArray<{ heading: string; summary: string }>;
}

function renderSectionsForPrompt(input: ProposePackDraftInput): string {
  const lines = input.sections.map((section) => `- ${section.heading}: ${section.summary}`);
  return `Document: ${input.documentTitle}\n\nSections:\n${lines.join('\n')}`;
}

export async function proposePackDraft(
  gateway: LlmGateway,
  model: string,
  input: ProposePackDraftInput,
): Promise<PackDraftProposal> {
  let raw = '';
  let failed: string | null = null;
  for await (const event of gateway.streamTurn({
    turnId: `authoring-pack-${Date.now()}`,
    model,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: renderSectionsForPrompt(input) }],
  })) {
    if (event.type === 'text') raw += event.text;
    if (event.type === 'error') failed = event.message;
  }
  if (failed !== null) {
    throw new Error(`Pack draft proposal failed: ${failed}`);
  }
  try {
    return packDraftProposalSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (cause) {
    throw new Error(
      `Model did not return valid pack draft JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
