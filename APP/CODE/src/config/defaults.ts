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

/** Version stamp for the current toolset — part of the deterministic cache key. */
export const TOOLSET_VERSION = 'phase0-no-tools';

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
} as const;
