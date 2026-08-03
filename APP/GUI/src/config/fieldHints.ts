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
  quickModelPicker: {
    what: 'Which model answers your next message — a built-in tier, or one of your saved providers.',
    why: 'A saved provider only appears here once it has a model selected in Settings > Providers & models. Picking one here overrides Settings’ tier just for this conversation until you change it back.',
    example: 'Pick "Fast" for a quick answer, or your own OpenAI-compatible endpoint for a specific model.',
  },
  domainPack: {
    what: 'The active domain pack (vocabulary, tools, and behaviour).',
    why: 'Protean shape-shifts per domain \u2014 switching packs changes how answers are framed, with no code change.',
    example: 'Finance / CFO\u2019s-CFO analyst',
  },
  attachFile: {
    what: 'Attach text files (JSON, Markdown, CSV\u2026) or a .zip of them to your message.',
    why: 'File content is read into the turn and stays in the conversation, so follow-ups can keep working on it. A zip is unpacked server-side into its individual text files \u2014 binary entries inside it are skipped with a note, never silently dropped.',
    example: 'Upload a zipped export of CSV files and ask Protean to reconcile them.',
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
    what: 'Latency, cache, and token/cost facts for the last answer, plus a running total for this conversation.',
    why: 'Protean measures every turn \u2014 leanness you can\u2019t see can\u2019t be defended. The token/cost figures here are exact, reported by the provider after the turn completes; the "~N tok" estimate you see in the composer while typing is a rough client-side heuristic (characters \u00f7 4), not the real count \u2014 it exists to give a sense of scale before you send, not to predict the bill.',
    example: 'TTFT 640 ms \u00b7 total 3.2 s \u00b7 cache miss \u00b7 1.2k in \u00b7 340 out \u00b7 $0.0041',
  },
  groundedKnowledge: {
    what: 'POC: ground answers in a curated knowledge collection for this domain (e.g. real ATO/RACGP source text), cited by source.',
    why: 'Unticked is standard behaviour \u2014 this is an experimental parallel path, off by default, so you can A/B it against normal answers.',
    example: 'Finance grounded in ATO R&D Tax Incentive guidance; Medical grounded in RACGP Standards.',
  },
  fabricationBanner: {
    what: 'A deterministic, code-run check found a phrase claiming a lookup happened (e.g. "retrieved from", "official knowledge base") with no matching tool call this turn.',
    why: 'A correct figure with a fabricated citation is still a fabrication (Law 6) \u2014 this is not the model self-reporting, it is a post-hoc scan of its own output against its own tool-call record, shown exactly as found.',
    example: 'Flagged phrase: "according to our database" \u2014 no query_knowledge_base call ran this turn.',
  },
  chunkFidelityCheck: {
    what: 'A second, independent LLM call that compares the deterministic chunker’s output against the raw extracted source text and flags anything that looks missing or added.',
    why: 'A heuristic chunker can misjudge where one section ends and another begins, and content caught in that misjudgement can go missing silently — a real gap found and fixed during testing. This check runs automatically before you review anything, so a content-loss bug is flagged instead of hidden.',
    example: 'Missing: "$82,340 cumulative turnover" appears in the source but not in any chunk.',
  },
  groundingConfidenceBadge: {
    what: 'This grounded turn called the knowledge-base tool but got back thin (\u201clow\u201d) or zero (\u201cnone\u201d) evidence, relative to how many results it asked for.',
    why: 'Code-computed from the real tool-call results, never the model\u2019s own opinion of its confidence \u2014 a signal that the answer may be leaning on general knowledge rather than the curated source material.',
    example: 'Asked for 5 results, got 1 back \u2192 "low". Asked for 5, got 0 back \u2192 "none".',
  },
  responseDepth: {
    what: 'A plain-language stand-in for the response length/complexity budget (the raw number was previously only a server env var).',
    why: 'Bigger, more expert answers cost more tokens and take longer \u2014 this lets you trade that off per question instead of a fixed engine-wide number. It never changes which model tier answers, only how much room and depth the reply gets.',
    example: 'HSC Level: short, plain-language, ~3,000 tokens. Uni Degree: standard depth, ~8,000 tokens. Professor: full expert rigor, ~16,000 tokens.',
  },
  advancedTurnTokenBudget: {
    what: 'Manual override of the exact response token budget for this turn, overriding whichever depth preset is selected.',
    why: 'For when none of the three presets fit \u2014 e.g. a very long document that needs more room than "Professor" budgets by default.',
    example: '24000 for a long multi-section report; leave blank to use the selected depth preset.',
  },
  agentMaxTurns: {
    what: 'Maximum number of agent-loop steps (tool calls / reasoning turns) this turn is allowed to take.',
    why: 'Lower it to force a quicker, more contained answer; raise it for a task that genuinely needs many tool calls to finish. Capped server-side regardless of what\u2019s entered here.',
    example: '3 for a quick single-file lookup; leave blank to use the server\u2019s own default.',
  },
  reasoningEffort: {
    what: 'How hard the model thinks before answering \u2014 a real Claude Agent SDK setting, only wired up for the built-in Fast/Strong tiers.',
    why: 'Lower effort answers faster and cheaper for simple turns; higher effort reasons more deeply for hard ones. Greyed out when a custom provider is selected in the composer \u2014 the vendor HTTP APIs behind custom providers don\u2019t have this control, so it would be a fake button there.',
    example: 'Low for a quick lookup; Max for a genuinely hard multi-step problem.',
  },
  providerTemperature: {
    what: 'Sampling temperature and max response tokens for a custom provider\u2019s HTTP calls.',
    why: 'These are real fields on the Anthropic/Bedrock/OpenAI-compatible HTTP APIs \u2014 but the built-in Fast/Strong tiers run through the Claude Agent SDK, which has no temperature field at all, so these controls are greyed out unless you\u2019ve picked a custom provider in the composer. Anthropic/Bedrock accept 0\u20131; OpenAI-compatible endpoints accept 0\u20132.',
    example: '0.2 for consistent, focused answers; 0.9 for more varied/creative ones.',
  },
  providerMaxTokens: {
    what: 'The maximum number of tokens a custom provider\u2019s response may use.',
    why: 'Caps response length and cost for that call \u2014 defaults to 4096 when left blank. Only applies when a custom provider is selected.',
    example: '512 for a short answer; 4096 for a longer one.',
  },
  providersModels: {
    what: 'LLM providers you\u2019ve connected, beyond the platform\u2019s built-in Fast/Strong tiers.',
    why: 'Bring your own Anthropic, Bedrock, or OpenAI-compatible account to use a specific model \u2014 test the connection and list its models before saving, so a typo in a key fails here, not mid-conversation.',
    example: 'Add an OpenAI-compatible endpoint for a self-hosted model, test it, then pick it in the composer.',
  },
  providerLabel: {
    what: 'A name for this provider, just for your own reference.',
    why: 'You\u2019ll see this label in the saved-providers list and in the model picker \u2014 pick something you\u2019ll recognise later.',
    example: 'Prod Bedrock, My Claude account, Local vLLM',
  },
  providerApiKey: {
    what: 'The API key for this provider.',
    why: 'Stored server-side only \u2014 never sent back to your browser in plain text after saving, only ever shown redacted (last 4 characters).',
    example: 'sk-ant-...',
  },
  providerAwsRegion: {
    what: 'The AWS region this Bedrock account/key is provisioned in.',
    why: 'Bedrock model availability and endpoints are region-specific \u2014 the wrong region behaves like a bad key even if the key itself is valid.',
    example: 'us-east-1',
  },
  providerBearerToken: {
    what: 'A Bedrock API key (bearer token) \u2014 AWS\u2019s newer, simpler alternative to full IAM credentials.',
    why: 'Same auth style this platform\u2019s own built-in Bedrock connection already uses \u2014 no AWS SDK/IAM setup needed here.',
    example: 'ABSK...',
  },
  providerModel: {
    what: 'Which of this provider’s models the quick picker (next to Attach) sends turns to.',
    why: 'A provider connection alone isn’t enough to answer a turn — a specific model id is required. Pick one from the list you just fetched.',
    example: 'claude-sonnet-5, gpt-4o, llama-3-70b-instruct',
  },
  providerBaseUrl: {
    what: 'The base URL of an OpenAI-compatible API endpoint.',
    why: 'Any service that implements the OpenAI /models and /chat/completions shape can be connected this way \u2014 self-hosted or third-party.',
    example: 'https://your-endpoint.example.com/v1',
  },
  mcpTools: {
    what: 'External tools (MCP servers) you can add beyond the platform\u2019s built-in ones.',
    why: 'Test a server before saving it \u2014 a bad command or missing credential fails here with a specific reason, not silently mid-conversation.',
    example: 'A local script that queries an internal system, exposed as an MCP stdio server.',
  },
  mcpConnectorId: {
    what: 'The catalog key this connector is saved under.',
    why: 'A domain pack\u2019s own `tools` list references this id to actually wire the connector into a conversation \u2014 saving here makes it available, not automatically active.',
    example: 'myCustomTool',
  },
  mcpJson: {
    what: 'The connector definition as JSON \u2014 command, arguments, required env var names, and which tools it exposes.',
    why: 'Only "stdioMcp" (an external process) can be added this way \u2014 built-in tools require code in the engine itself. Edit the template fields to match your server.',
    example: '{"kind":"stdioMcp","serverId":"my-server","command":"npx",...}',
  },
  domainPackBuildFromDocuments: {
    what: 'Upload a text-native PDF and let the model propose a heading and one-sentence summary for each extracted section, strictly from that section’s own real text — never guessed or drawn from another section.',
    why: 'This is the guardrail against hallucination: every proposal is shown next to its literal source excerpt for you to verify before anything saves. Scanned/image-only PDFs are rejected outright — no OCR guessing.',
    example: 'Upload an HR policy PDF, review the proposed section headings against the real text, then save it as a knowledge collection a pack can reference.',
  },
  domainPackIngestUrl: {
    what: 'Fetch a document straight from a URL (a PDF or an HTML page — e.g. legislation, a curriculum, a regulator standard) instead of uploading a file. Paste several, one per line, to build one collection from multiple sources at once.',
    why: 'The fetch itself is a plain deterministic download and extraction — never the agent’s own web-search tool — so the same real-text review and completeness check you get for an uploaded PDF applies here too, per source.',
    example: 'Paste the citation URLs a research chat turn just gave you, one per line, then review each source’s chunks before saving.',
  },
  domainPackImport: {
    what: 'Upload a domain-pack-shaped JSON file (systemPrompt, plus optionally title/packVersion/outputTemplates/validationSchema) and have its fields deterministically mapped onto a new pack draft — no LLM involved, this is a straight structural mapping.',
    why: 'Fields that map cleanly (systemPrompt, title, outputTemplates, a validationSchema) are filled in automatically; anything the importer doesn’t recognise is listed as a note rather than silently dropped, and nothing saves until you review the draft in the editor and click Save.',
    example: 'A pack bundle exported from another tool with systemPrompt + outputTemplates + validationSchema fields — the schema itself is preserved under validation.outputSchema for reference.',
  },
  domainPackId: {
    what: 'The pack\u2019s unique id \u2014 what the domain picker and API calls reference it by.',
    why: 'Locked after creation. If it matches a built-in pack (finance/medical/generic) your changes become a personal override of that pack, reversible with "Reset to default"; any other id creates a brand-new pack.',
    example: 'legal, hr-onboarding, sales-enablement',
  },
  domainPackSystemPrompt: {
    what: 'The persona and behaviour instructions that open every turn answered by this pack.',
    why: 'This is the single biggest lever on how the assistant sounds and what it prioritises for this domain \u2014 it\u2019s rendered into the cacheable system-prompt prefix, so keep it stable rather than editing it every turn.',
    example: '"You are a precise, evidence-first R&D tax analyst. Always cite the specific ATO provision you\u2019re relying on."',
  },
  domainPackTools: {
    what: 'Which connectors (from the Tools tab\u2019s catalog) this pack\u2019s conversations can use.',
    why: 'A tool only becomes available in a conversation if its id is checked here \u2014 adding a connector under the Tools tab makes it available platform-wide, but a pack must still opt in to actually use it.',
    example: 'search, dataLakeQuery',
  },
  domainPackKnowledgeWeight: {
    what: 'Which curated knowledge collections this pack may ground answers in, and how strongly each is weighted.',
    why: 'A weight is a relevance multiplier (default 1) applied when ranking retrieved chunks and ordering the always-included digest \u2014 a collection weighted 2 is preferred roughly twice as strongly over one weighted 1 for the same query match. Only takes effect when the conversation has "Grounded knowledge" ticked on.',
    example: 'Weight the core regulation text at 2 and a supplementary FAQ collection at 0.5 so the FAQ only wins on an exact-term match.',
  },
  domainPackOutputTemplates: {
    what: 'Named output shapes (as JSON) the pack\u2019s system prompt can reference by name.',
    why: 'Keeps a consistent structure for recurring deliverables (e.g. a report\u2019s section order) without hardcoding it into every prompt edit.',
    example: '{"brief": "answer first \u2192 detail"}',
  },
  domainPackValidation: {
    what: 'Free-form validation rules (as JSON) associated with this pack \u2014 not yet enforced by the engine, kept as declared metadata.',
    why: 'A place to record domain-specific constraints (e.g. required disclaimers) so they\u2019re documented alongside the pack even before enforcement code exists for them.',
    example: '{}',
  },
  conversationSearch: {
    what: 'Search every saved conversation by title words, or filter by cost, tokens, message count, or domain using >, <, >=, <=, =, != (e.g. cost>0.05).',
    why: 'Every turn already records its own cost/token numbers (Law 6) \u2014 this searches that real evidence instead of just titles.',
    example: 'cost>0.05 domain=finance',
  },
};
