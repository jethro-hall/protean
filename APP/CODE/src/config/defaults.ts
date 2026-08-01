/**
 * Protocol constants and defaults, named here per Law 2 — never literals buried in logic.
 * Anything overridable at runtime resolves through loadConfig() (env wins over these).
 */
export const DEFAULT_PORT = 8787;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_CACHE_TTL_SECONDS = 3600;
export const DEFAULT_CACHE_MAX_ENTRIES = 500;
export const DEFAULT_DOMAIN_ID = 'generic';

/** How many prior messages the Watcher includes when assembling a turn (Phase 0 baseline). */
export const DEFAULT_HISTORY_WINDOW_MESSAGES = 20;

/** Watcher budget: estimated-token ceiling for one assembled turn (history trimmed to fit). */
export const DEFAULT_TURN_TOKEN_BUDGET = 8000;

/** Rewrite gate: inputs estimated above this are "bloated" and eligible for Tier-1 rewrite. */
export const DEFAULT_REWRITE_BLOAT_TOKENS = 600;

/**
 * Dynamic agent loop defaults (owner pull-forward 2026-07-28).
 * Read/Grep/Glob only — Bash waits on a proven sandbox (Law 1: no unsandboxed shell).
 * Values override via PROTEAN_AGENT_* env (see loadConfig).
 */
export const DEFAULT_AGENT_AVAILABLE_TOOLS = ['Read', 'Grep', 'Glob'] as const;
export const DEFAULT_AGENT_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob'] as const;
export const DEFAULT_AGENT_MAX_TURNS = 8;
export const DEFAULT_AGENT_PERMISSION_MODE = 'dontAsk' as const;

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

/** Upload limits: text attachments only for now; caps keep prompts inside the token budget. */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;
export const MAX_ATTACHMENTS_PER_TURN = 5;

/** Surfaced when the client aborts mid-turn (Stop) — not a provider failure. */
export const TURN_STOPPED_MESSAGE = 'Turn stopped by user';

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
  agentMaxTurns: 'PROTEAN_AGENT_MAX_TURNS',
  agentAvailableTools: 'PROTEAN_AGENT_AVAILABLE_TOOLS',
  agentAllowedTools: 'PROTEAN_AGENT_ALLOWED_TOOLS',
  agentPermissionMode: 'PROTEAN_AGENT_PERMISSION_MODE',
} as const;
