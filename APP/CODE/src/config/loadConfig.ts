import { join } from 'node:path';
import type { ModelTier } from '../contracts/turn.js';
import {
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  ENV,
} from './defaults.js';
import { codeDir, loadDotEnv, repoRoot } from './env.js';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface ProteanConfig {
  port: number;
  logLevel: LogLevel;
  cache: { ttlSeconds: number; maxEntries: number };
  /** Model IDs per tier. Strong is required for any live run; fast may be unset until Phase 2. */
  models: Partial<Record<ModelTier, string>>;
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
    artefactsDir: string;
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
      artefactsDir: process.env[ENV.artefactsDir] ?? join(root, 'APP', 'ARTEFACTS'),
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
