/**
 * (i) info-affordance content — DATA, not code (UX_STANDARDS §2, Law 2).
 * Every required input/output surface reads its hint from here; components
 * never hardcode hint text.
 */
export interface FieldHint {
  what: string;
  why: string;
  example?: string;
}

export const fieldHints: Record<string, FieldHint> = {
  composerInput: {
    what: 'Your message to the assistant.',
    why: 'It is optimised and routed through Protean before reaching the model, with full history kept.',
    example: 'Summarise last quarter\u2019s gross profit movement in three bullets.',
  },
  modelTier: {
    what: 'The speed/quality tier answering you.',
    why: 'Fast answers simple turns cheaply; Strong reasons more deeply but costs more and takes longer.',
  },
  domainPack: {
    what: 'The active domain pack (vocabulary, tools, and behaviour).',
    why: 'Protean shape-shifts per domain \u2014 switching packs changes how answers are framed, with no code change.',
    example: 'Finance / CFO\u2019s-CFO analyst',
  },
  attachFile: {
    what: 'Attach text files (JSON, Markdown, CSV\u2026) to your message.',
    why: 'The file content is read into the turn and stays in the conversation, so follow-ups can keep working on it.',
    example: 'Upload an n8n workflow spec and ask Protean to build the workflow JSON.',
  },
  agentActivity: {
    what: 'The real working steps of this turn \u2014 reasoning, file reads, tool runs.',
    why: 'Protean shows what actually happened, as it happens \u2014 never a cosmetic spinner.',
    example: 'Thought process \u00b7 Read spec.json (3.2 KB) into context',
  },
  chatStream: {
    what: 'The assistant\u2019s reply, streamed as it is generated.',
    why: 'Streaming shows progress honestly \u2014 you can read, and stop trusting, an answer as it forms.',
  },
  previewPane: {
    what: 'A live surface for artefacts the assistant builds (documents, tables, pages).',
    why: 'You watch the artefact update during generation and steer it with follow-ups. Revisions of the same deliverable appear as v1, v2\u2026 tabs.',
    example: 'Drag the left edge to resize; click an artefact card in the chat to open it here.',
  },
  turnStats: {
    what: 'Latency and cache facts for the last answer (TTFT, total, cache hit).',
    why: 'Protean measures every turn \u2014 leanness you can\u2019t see can\u2019t be defended.',
    example: 'TTFT 640 ms \u00b7 total 3.2 s \u00b7 cache miss',
  },
};
