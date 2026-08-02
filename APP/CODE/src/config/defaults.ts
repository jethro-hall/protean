/**
 * Protocol constants and defaults, named here per Law 2 — never literals buried in logic.
 * Anything overridable at runtime resolves through loadConfig() (env wins over these).
 */
export const DEFAULT_PORT = 8787;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_CACHE_TTL_SECONDS = 3600;
export const DEFAULT_CACHE_MAX_ENTRIES = 500;
export const DEFAULT_DOMAIN_ID = 'generic';
export const DEFAULT_PG_PORT = 5432;
/** Voyage AI's current general-purpose model -- 1024-dim, matches the pgvector schema (Phase M). */
export const DEFAULT_EMBEDDING_MODEL = 'voyage-4';

/** How many prior messages the Watcher includes when assembling a turn (Phase 0 baseline). */
export const DEFAULT_HISTORY_WINDOW_MESSAGES = 20;

/** Watcher budget: estimated-token ceiling for one assembled turn (history trimmed to fit). */
export const DEFAULT_TURN_TOKEN_BUDGET = 8000;

/**
 * Friendly response-depth presets (Phase 6) — a plain-language alternative to asking someone
 * to pick a raw token-budget number. Each preset sets a response token budget and a writing-depth
 * instruction ONLY — deliberately independent of model tier (tier stays its own separate control,
 * so choosing a depth never silently changes which model answers). "Uni Degree" reuses
 * DEFAULT_TURN_TOKEN_BUDGET so it reproduces the platform's pre-existing standard behaviour exactly.
 */
export interface ResponseDepthPreset {
  label: string;
  turnTokenBudget: number;
  instruction: string;
}

export const RESPONSE_DEPTH_PRESETS: Record<'hscLevel' | 'uniDegree' | 'professor', ResponseDepthPreset> = {
  hscLevel: {
    label: 'HSC Level',
    turnTokenBudget: 3000,
    instruction:
      'Answer at a clear, plain-language level (roughly Australian Year 11–12 / HSC) — short ' +
      'sentences, define any jargon on first use, keep it concise and easy to follow.',
  },
  uniDegree: {
    label: 'Uni Degree',
    turnTokenBudget: DEFAULT_TURN_TOKEN_BUDGET,
    instruction:
      'Answer at an undergraduate-degree level — technical vocabulary is fine, back claims with ' +
      'brief reasoning, moderate depth. (This is the platform\'s standard depth.)',
  },
  professor: {
    label: 'Professor',
    turnTokenBudget: 16000,
    instruction:
      'Answer at an expert/postgraduate level — full technical rigor, surface edge cases, ' +
      'caveats, and nuance; do not oversimplify.',
  },
};

/** Rewrite gate: inputs estimated above this are "bloated" and eligible for Tier-1 rewrite. */
export const DEFAULT_REWRITE_BLOAT_TOKENS = 600;

/**
 * Auto-tier gate: inputs estimated above this are eligible for fast→strong escalation
 * (only when the caller didn't pin a tier explicitly). PROVISIONAL — chosen the same way
 * DEFAULT_REWRITE_BLOAT_TOKENS was before its A/B proof, and likewise gated OFF by default
 * (watcher.autoTierEnabled) until an eval set built for task complexity (not bloat) proves
 * escalation improves scores enough to justify the cost. Do not raise autoTierEnabled to
 * default-on without that evidence (Law 1).
 */
export const DEFAULT_AUTO_TIER_ESCALATION_TOKENS = 2000;

/**
 * Dynamic agent loop defaults (owner pull-forward 2026-07-28).
 * Read/Grep/Glob only — Bash waits on a proven sandbox (Law 1: no unsandboxed shell).
 * Values override via PROTEAN_AGENT_* env (see loadConfig).
 */
export const DEFAULT_AGENT_AVAILABLE_TOOLS = ['Read', 'Grep', 'Glob'] as const;
export const DEFAULT_AGENT_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob'] as const;
export const DEFAULT_AGENT_MAX_TURNS = 8;
export const DEFAULT_AGENT_PERMISSION_MODE = 'dontAsk' as const;

/** Hard ceiling on a per-request agentMaxTurns override, regardless of what the client asks for. */
export const AGENT_MAX_TURNS_CEILING = 20;

/** Per-request override wins over the server's configured default, but never past the ceiling. */
export function resolveEffectiveAgentMaxTurns(
  requested: number | undefined,
  configuredDefault: number,
  ceiling: number = AGENT_MAX_TURNS_CEILING,
): number {
  return Math.min(requested ?? configuredDefault, ceiling);
}

/** Deterministic cache-key stamp derived from the effective tool policy. */
export function toolsetVersionFromPolicy(policy: {
  availableTools: readonly string[];
  maxTurns: number;
  permissionMode: string;
}): string {
  const tools = [...policy.availableTools].sort().join('+') || 'none';
  return `loop-t${policy.maxTurns}-${policy.permissionMode}-${tools}`;
}

/**
 * Artefact wire protocol instruction (Phase 3) — an ENGINE protocol constant,
 * not a domain fact: appended to every domain pack's system prompt so the
 * preview pane can render artefacts live from any pack.
 */
export const ARTEFACT_PROTOCOL_PROMPT =
  'When the user asks you to produce a document, web page, table, chart, or other standalone ' +
  'artefact, emit it wrapped EXACTLY as: <protean:artefact type="html|markdown|code|text" ' +
  'title="Short title">…artefact content…</protean:artefact>. Put explanation OUTSIDE the tags, ' +
  'keep the artefact complete and self-contained inside them, and when asked to modify an ' +
  'artefact, re-emit the FULL updated artefact in the same tags.';

/**
 * Working-narration protocol — an ENGINE protocol constant, not a domain fact.
 * The GUI renders text and working steps interleaved in stream order, so the
 * model is asked to work like a senior analyst sharing their screen.
 */
export const NARRATION_PROTOCOL_PROMPT =
  'Narrate as you work, in short plain-language paragraphs BETWEEN your working steps: what you ' +
  'are about to do and why, what you found in any provided material (quote the exact field names ' +
  'or values that matter), and what you decided. When a decision materially shapes the ' +
  'deliverable, state the question, the answer you chose, and the reason. Before building or ' +
  'revising an artefact, say what you are building; after revising one, list precisely what ' +
  'changed and why, item by item. Never reply with a bare confirmation like "done" or ' +
  '"updated" — the user must be able to follow your reasoning from the transcript alone.';

/**
 * Citation-honesty protocol — an ENGINE protocol constant (every pack, not domain-specific),
 * closing a real failure mode found in the grounded-knowledge POC (2026-08-01 BUILD_LOG):
 * with no tool called, the model still produced a plausible-sounding "Source: ... official
 * knowledge base" citation for a lookup that never happened. Law 6 ("evidence or nothing")
 * forbids that regardless of whether the underlying figure happened to be correct.
 */
export const CITATION_HONESTY_PROTOCOL_PROMPT =
  'You may only claim you consulted a tool, dataset, document, or knowledge base if you actually ' +
  'called it THIS turn — a real tool call will appear in your own working steps. Never write ' +
  'phrases like "official knowledge base", "retrieved from", "looked up", or "according to our ' +
  'database" unless a tool call backs that exact claim. When a fact comes from your own trained ' +
  'knowledge and no tool was called, say so plainly (e.g. "from general knowledge, not verified ' +
  'against a live source this turn") — a correct figure with a fabricated citation is still a ' +
  'fabrication.';

/** Upload limits: text attachments only for now; caps keep prompts inside the token budget. */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;
export const MAX_ATTACHMENTS_PER_TURN = 5;

/**
 * Zip archives get their own, larger cap (base64-encoded size, before decode) — a zip is
 * expected to hold several small text files. Unpacked entries are still subject to
 * MAX_ATTACHMENT_BYTES / MAX_ATTACHMENTS_PER_TURN individually, same as any attachment.
 */
export const MAX_ZIP_BYTES = 2 * 1024 * 1024;

/** Domain-pack document ingestion (Phase O) — base64-encoded size, before decode. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;

/** Surfaced when the client aborts mid-turn (Stop) — not a provider failure. */
export const TURN_STOPPED_MESSAGE = 'Turn stopped by user';

/**
 * Grounded-knowledge POC (Phase 6): the connector id auto-appended to a pack's
 * declared tools when a request opts in AND the pack has knowledgeCollections.
 * Never in a pack's own `tools` array — it is conditional, not always-on.
 */
export const GROUNDING_TOOL_ID = 'knowledgeBaseQuery';

/** SSE wire constants (the internal stream protocol to the GUI). */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/** Env var names the engine reads (single source for spelling). */
export const ENV = {
  port: 'PROTEAN_PORT',
  logLevel: 'PROTEAN_LOG_LEVEL',
  cacheTtlSeconds: 'PROTEAN_CACHE_TTL_SECONDS',
  fastModel: 'PROTEAN_FAST_MODEL',
  strongModel: 'PROTEAN_STRONG_MODEL',
  anthropicModel: 'ANTHROPIC_MODEL',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  useBedrock: 'CLAUDE_CODE_USE_BEDROCK',
  awsRegion: 'AWS_REGION',
  awsBearerToken: 'AWS_BEARER_TOKEN_BEDROCK',
  dataDir: 'PROTEAN_DATA_DIR',
  artefactsDir: 'PROTEAN_ARTEFACTS_DIR',
  turnTokenBudget: 'PROTEAN_TURN_TOKEN_BUDGET',
  rewriteEnabled: 'PROTEAN_REWRITE_ENABLED',
  rewriteBloatTokens: 'PROTEAN_REWRITE_BLOAT_TOKENS',
  autoTierEnabled: 'PROTEAN_AUTO_TIER_ENABLED',
  autoTierEscalationTokens: 'PROTEAN_AUTO_TIER_ESCALATION_TOKENS',
  agentMaxTurns: 'PROTEAN_AGENT_MAX_TURNS',
  agentAvailableTools: 'PROTEAN_AGENT_AVAILABLE_TOOLS',
  agentAllowedTools: 'PROTEAN_AGENT_ALLOWED_TOOLS',
  agentPermissionMode: 'PROTEAN_AGENT_PERMISSION_MODE',
  datasetsDir: 'PROTEAN_DATASETS_DIR',
  /** Grounded Knowledge v2 (Phase M, ADR-0002) -- optional; absent = vector search degrades to TF-IDF-only. */
  pgHost: 'PG_HOST',
  pgPort: 'PG_PORT',
  pgUser: 'PG_USER',
  pgPassword: 'PG_PASSWORD',
  pgDatabase: 'PG_DB',
  /** Embedding gateway (Phase N) -- optional; absent = grounded ingestion/hybrid search unavailable, TF-IDF still works. */
  voyageApiKey: 'VOYAGE_API_KEY',
  embeddingModel: 'PROTEAN_EMBEDDING_MODEL',
} as const;
