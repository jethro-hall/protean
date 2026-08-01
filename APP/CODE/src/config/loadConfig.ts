import { join } from 'node:path';
import {
  permissionModeSchema,
  toolPolicySchema,
  type ToolPolicy,
} from '../contracts/agentLoop.js';
import type { ModelTier } from '../contracts/turn.js';
import {
  DEFAULT_AGENT_ALLOWED_TOOLS,
  DEFAULT_AGENT_AVAILABLE_TOOLS,
  DEFAULT_AGENT_MAX_TURNS,
  DEFAULT_AGENT_PERMISSION_MODE,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  DEFAULT_REWRITE_BLOAT_TOKENS,
  DEFAULT_TURN_TOKEN_BUDGET,
  ENV,
  toolsetVersionFromPolicy,
} from './defaults.js';
import { codeDir, loadDotEnv, repoRoot } from './env.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface ProteanConfig {
  port: number;
  logLevel: LogLevel;
  cache: { ttlSeconds: number; maxEntries: number };
  /** Model IDs per tier. Strong is required for any live run; fast may be unset until Phase 2. */
  models: Partial<Record<ModelTier, string>>;
  watcher: {
    turnTokenBudget: number;
    /** Conditional rewrite: OFF until the A/B eval proves it pays for itself (ARCHITECTURE §3). */
    rewriteEnabled: boolean;
    rewriteBloatTokens: number;
  };
  /** Open-ended dynamic agent loop (tools + multi-turn). Not a scripted workflow. */
  agentLoop: ToolPolicy & { toolsetVersion: string };
  provider: {
    useBedrock: boolean;
    awsRegion: string | undefined;
    hasAnthropicApiKey: boolean;
    hasBedrockBearerToken: boolean;
  };
  paths: {
    repoRoot: string;
    domainsDir: string;
    dataDir: string;
    promptHistoryDir: string;
    tokenTelemetryDir: string;
    sessionsDir: string;
    evalSetsDir: string;
    evalResultsDir: string;
    uploadsDir: string;
    artefactsDir: string;
    /** CSV/JSON datasets for registry MCP connectors (data lake, calendar). */
    datasetsDir: string;
  };
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Env ${name} must be an integer, got "${raw}"`);
  return parsed;
}

const LOG_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

function logLevelFromEnv(): LogLevel {
  const raw = process.env[ENV.logLevel] ?? DEFAULT_LOG_LEVEL;
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`Env ${ENV.logLevel} must be one of ${LOG_LEVELS.join('/')}, got "${raw}"`);
  }
  return raw as LogLevel;
}

function csvToolsFromEnv(name: string, fallback: readonly string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return [...fallback];
  const tools = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tools.length === 0) {
    throw new Error(`Env ${name} listed no tools — use a comma-separated list or unset for defaults`);
  }
  return tools;
}

function agentLoopFromEnv(): ToolPolicy & { toolsetVersion: string } {
  const permissionRaw = process.env[ENV.agentPermissionMode] ?? DEFAULT_AGENT_PERMISSION_MODE;
  const permissionParsed = permissionModeSchema.safeParse(permissionRaw);
  if (!permissionParsed.success) {
    throw new Error(
      `Env ${ENV.agentPermissionMode} must be a valid permission mode, got "${permissionRaw}"`,
    );
  }
  const policy = toolPolicySchema.parse({
    availableTools: csvToolsFromEnv(ENV.agentAvailableTools, DEFAULT_AGENT_AVAILABLE_TOOLS),
    allowedTools: csvToolsFromEnv(ENV.agentAllowedTools, DEFAULT_AGENT_ALLOWED_TOOLS),
    maxTurns: intFromEnv(ENV.agentMaxTurns, DEFAULT_AGENT_MAX_TURNS),
    permissionMode: permissionParsed.data,
  });
  if (policy.availableTools.includes('Bash')) {
    throw new Error(
      `${ENV.agentAvailableTools} includes Bash — refused until sandbox is proven on this host ` +
        '(set Read,Grep,Glob only; see BUILD_LOG 2026-07-28)',
    );
  }
  return { ...policy, toolsetVersion: toolsetVersionFromPolicy(policy) };
}

/** Resolve the full runtime config from env (+ repo-root .env). Fails loudly, never guesses. */
export function loadConfig(): ProteanConfig {
  loadDotEnv();
  const root = repoRoot();
  const dataDir = process.env[ENV.dataDir] ?? join(root, 'APP', 'LLMBUILD_DATA');
  const strongModel =
    process.env[ENV.strongModel] ?? process.env[ENV.anthropicModel] ?? undefined;
  const fastModel = process.env[ENV.fastModel] ?? undefined;

  return {
    port: intFromEnv(ENV.port, DEFAULT_PORT),
    logLevel: logLevelFromEnv(),
    cache: {
      ttlSeconds: intFromEnv(ENV.cacheTtlSeconds, DEFAULT_CACHE_TTL_SECONDS),
      maxEntries: DEFAULT_CACHE_MAX_ENTRIES,
    },
    watcher: {
      turnTokenBudget: intFromEnv(ENV.turnTokenBudget, DEFAULT_TURN_TOKEN_BUDGET),
      rewriteEnabled: process.env[ENV.rewriteEnabled] === '1',
      rewriteBloatTokens: intFromEnv(ENV.rewriteBloatTokens, DEFAULT_REWRITE_BLOAT_TOKENS),
    },
    agentLoop: agentLoopFromEnv(),
    models: {
      ...(strongModel !== undefined ? { strong: strongModel } : {}),
      ...(fastModel !== undefined ? { fast: fastModel } : {}),
    },
    provider: {
      useBedrock: process.env[ENV.useBedrock] === '1',
      awsRegion: process.env[ENV.awsRegion],
      hasAnthropicApiKey: (process.env[ENV.anthropicApiKey] ?? '') !== '',
      hasBedrockBearerToken: (process.env[ENV.awsBearerToken] ?? '') !== '',
    },
    paths: {
      repoRoot: root,
      domainsDir: join(codeDir(), 'src', 'domains'),
      dataDir,
      promptHistoryDir: join(dataDir, 'prompt-history'),
      tokenTelemetryDir: join(dataDir, 'token-telemetry'),
      sessionsDir: join(dataDir, 'sessions'),
      evalSetsDir: join(dataDir, 'eval-sets'),
      evalResultsDir: join(dataDir, 'eval-results'),
      uploadsDir: join(dataDir, 'uploads'),
      artefactsDir: process.env[ENV.artefactsDir] ?? join(root, 'APP', 'ARTEFACTS'),
      datasetsDir: process.env[ENV.datasetsDir] ?? join(dataDir, 'datasets'),
    },
  };
}

/** The model ID for a tier, or a loud failure naming the env var to set (Law 1: no guessing). */
export function requireModel(config: ProteanConfig, tier: ModelTier): string {
  const model = config.models[tier];
  if (model === undefined || model === '') {
    throw new Error(
      `No model configured for tier "${tier}". Set ${
        tier === 'strong' ? `${ENV.strongModel} or ${ENV.anthropicModel}` : ENV.fastModel
      } in .env — pin IDs via: aws bedrock list-inference-profiles --region ap-southeast-2`,
    );
  }
  return model;
}
