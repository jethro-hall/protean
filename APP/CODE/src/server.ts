import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { AgentCore } from './agent/AgentCore.js';
import { createClaudeSdkAgentCore } from './agent/adapters/claudeSdk.js';
import { DEFAULT_DOMAIN_ID, SSE_HEADERS } from './config/defaults.js';
import { listDomainPacks, loadDomainPack } from './config/domainPacks.js';
import { loadConfig, requireModel, type ProteanConfig } from './config/loadConfig.js';
import { modelTierSchema, type TurnEvent, type TurnRequest } from './contracts/turn.js';
import type { LlmGateway } from './gateway/LlmGateway.js';
import { createClaudeGateway } from './gateway/adapters/claude.js';
import { createLogger, type Logger } from './logging/logger.js';
import { createMemoryCacheStore, type CacheStore } from './watcher/cache.js';
import { resolveTier } from './watcher/assemble.js';
import { runTurn } from './watcher/runTurn.js';
import { createFileSessionStore, type SessionStore } from './watcher/sessionStore.js';

/** What the GUI/CLI actually posts — session/domain default server-side. */
const turnBodySchema = z.object({
  input: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  domainId: z.string().min(1).optional(),
  tier: modelTierSchema.optional(),
});

export interface AppDeps {
  config: ProteanConfig;
  logger: Logger;
  cache: CacheStore;
  sessions: SessionStore;
  agent: AgentCore;
  gateway: LlmGateway;
}

export function createAppDeps(config: ProteanConfig, logger: Logger): AppDeps {
  const gateway = createClaudeGateway(logger.child('gateway'));
  return {
    config,
    logger,
    cache: createMemoryCacheStore(config.cache.ttlSeconds, config.cache.maxEntries),
    // Phase 2: history persists across restarts (file-backed JSONL per session)
    sessions: createFileSessionStore(config.paths.sessionsDir),
    agent: createClaudeSdkAgentCore(gateway, logger.child('agent')),
    gateway,
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function writeSseEvent(res: ServerResponse, event: TurnEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Stream one turn as SSE, updating session history on success. */
export async function handleTurn(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const log = deps.logger.child('server');
  let body: z.infer<typeof turnBodySchema>;
  try {
    const parsed = turnBodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      writeJson(res, 400, { error: `Invalid turn request: ${parsed.error.message}` });
      return;
    }
    body = parsed.data;
  } catch {
    writeJson(res, 400, { error: 'Body must be valid JSON' });
    return;
  }

  const request: TurnRequest = {
    sessionId: body.sessionId ?? randomUUID(),
    domainId: body.domainId ?? DEFAULT_DOMAIN_ID,
    input: body.input,
    ...(body.tier !== undefined ? { tier: body.tier } : {}),
  };

  let pack;
  let model: string;
  try {
    pack = loadDomainPack(deps.config.paths.domainsDir, request.domainId);
    model = requireModel(deps.config, resolveTier(request, pack));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    log.error('server.turn.rejected', `Turn rejected before start: ${message}`);
    writeJson(res, 422, { error: message });
    return;
  }

  res.writeHead(200, { ...SSE_HEADERS, 'X-Session-Id': request.sessionId });
  // snapshot history BEFORE the turn — the Watcher appends this turn itself
  const history = [...deps.sessions.history(request.sessionId)];

  for await (const event of runTurn(request, {
    agent: deps.agent,
    gateway: deps.gateway,
    cache: deps.cache,
    pack,
    history,
    sessions: deps.sessions,
    model,
    watcher: {
      turnTokenBudget: deps.config.watcher.turnTokenBudget,
      rewriteEnabled: deps.config.watcher.rewriteEnabled,
      rewriteBloatTokens: deps.config.watcher.rewriteBloatTokens,
      ...(deps.config.models.fast !== undefined ? { fastModel: deps.config.models.fast } : {}),
    },
    log: deps.logger.child('watcher'),
    promptHistoryDir: deps.config.paths.promptHistoryDir,
    tokenTelemetryDir: deps.config.paths.tokenTelemetryDir,
    artefactsDir: deps.config.paths.artefactsDir,
  })) {
    writeSseEvent(res, event);
  }
  res.end();
}

function handleDomains(deps: AppDeps, res: ServerResponse): void {
  const ids = listDomainPacks(deps.config.paths.domainsDir);
  const packs = ids.map((id) => {
    const pack = loadDomainPack(deps.config.paths.domainsDir, id);
    return { id: pack.id, displayName: pack.displayName, version: pack.version };
  });
  writeJson(res, 200, { domains: packs });
}

export function startServer(deps: AppDeps): ReturnType<typeof createServer> {
  const log = deps.logger.child('server');
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${deps.config.port}`);
    if (req.method === 'GET' && url.pathname === '/healthz') {
      writeJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/domains') {
      handleDomains(deps, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/turn') {
      void handleTurn(deps, req, res).catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        log.error('server.turn.crashed', `Unhandled turn failure: ${message}`);
        if (!res.headersSent) writeJson(res, 500, { error: message });
        else res.end();
      });
      return;
    }
    writeJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  });
  server.listen(deps.config.port, () => {
    log.info('server.listening', `Protean engine listening on http://localhost:${deps.config.port}`);
  });
  return server;
}

const isDirectRun = process.argv[1]?.endsWith('server.ts') === true;
if (isDirectRun) {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  startServer(createAppDeps(config, logger));
}
