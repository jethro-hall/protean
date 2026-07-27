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
  chatStream: {
    what: 'The assistant\u2019s reply, streamed as it is generated.',
    why: 'Streaming shows progress honestly \u2014 you can read, and stop trusting, an answer as it forms.',
  },
  previewPane: {
    what: 'A live surface for artefacts the assistant builds (documents, tables, pages).',
    why: 'You watch the artefact update during generation and steer it with follow-ups.',
  },
  turnStats: {
    what: 'Latency and cache facts for the last answer (TTFT, total, cache hit).',
    why: 'Protean measures every turn \u2014 leanness you can\u2019t see can\u2019t be defended.',
    example: 'TTFT 640 ms \u00b7 total 3.2 s \u00b7 cache miss',
  },
};
