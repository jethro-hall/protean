import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { AgentCore } from './agent/AgentCore.js';
import { createClaudeSdkAgentCore } from './agent/adapters/claudeSdk.js';
import {
  AGENT_MAX_TURNS_CEILING,
  DEFAULT_DOMAIN_ID,
  GROUNDING_TOOL_ID,
  MAX_ATTACHMENTS_PER_TURN,
  MAX_ATTACHMENT_BYTES,
  MAX_ZIP_BYTES,
  resolveEffectiveAgentMaxTurns,
  SSE_HEADERS,
} from './config/defaults.js';
import { listDomainPacks, loadDomainPack } from './config/domainPacks.js';
import { loadConnectorCatalog } from './config/loadConnectors.js';
import { loadConfig, requireModel, type ProteanConfig } from './config/loadConfig.js';
import { resolveToolset } from './tools/registry.js';
import {
  attachmentSchema,
  modelTierSchema,
  responseDepthSchema,
  type TurnEvent,
  type TurnRequest,
} from './contracts/turn.js';
import type { LlmGateway } from './gateway/LlmGateway.js';
import { createClaudeGateway } from './gateway/adapters/claude.js';
import { createLogger, type Logger } from './logging/logger.js';
import { createMemoryCacheStore, type CacheStore } from './watcher/cache.js';
import { resolveEffectiveTier, resolveGrounding } from './watcher/assemble.js';
import { runTurn } from './watcher/runTurn.js';
import { createFileSessionStore, type SessionStore } from './watcher/sessionStore.js';
import { saveUpload } from './watcher/uploads.js';
import { expandZipAttachments } from './watcher/expandZipAttachments.js';

/** What the GUI/CLI actually posts — session/domain default server-side. */
const turnBodySchema = z.object({
  input: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  domainId: z.string().min(1).optional(),
  tier: modelTierSchema.optional(),
  /** Grounded-knowledge POC tickbox (Phase 6). Unticked/omitted = standard behaviour. */
  grounded: z.boolean().optional(),
  /** Friendly depth preset (Phase 6). Omitted = platform standard. */
  responseDepth: responseDepthSchema.optional(),
  /** Advanced manual override — wins over responseDepth's own budget. */
  turnTokenBudget: z.number().int().positive().max(64000).optional(),
  /**
   * Advanced per-request override of the agent-loop step ceiling. Clamped to
   * AGENT_MAX_TURNS_CEILING server-side regardless of what the client asks —
   * omitted = the server's own configured default (Phase 6).
   */
  agentMaxTurns: z.number().int().min(1).max(AGENT_MAX_TURNS_CEILING).optional(),
  attachments: z
    .array(
      attachmentSchema.refine(
        (file) => {
          const limit = file.encoding === 'base64' ? MAX_ZIP_BYTES : MAX_ATTACHMENT_BYTES;
          return file.textContent.length <= limit;
        },
        {
          message: `attachment exceeds its size limit (${MAX_ATTACHMENT_BYTES} bytes for text, ${MAX_ZIP_BYTES} bytes encoded for a zip)`,
        },
      ),
    )
    .max(MAX_ATTACHMENTS_PER_TURN)
    .optional(),
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

  // Zip attachments expand into individual text attachments before anything
  // else touches them, so uploads/prompt-assembly downstream only ever see
  // ordinary text (Phase 6 zip attach support).
  const { attachments: expandedAttachments, warnings: attachmentWarnings } = expandZipAttachments(
    body.attachments ?? [],
  );

  const request: TurnRequest = {
    sessionId: body.sessionId ?? randomUUID(),
    domainId: body.domainId ?? DEFAULT_DOMAIN_ID,
    input: body.input,
    ...(body.tier !== undefined ? { tier: body.tier } : {}),
    ...(body.grounded !== undefined ? { grounded: body.grounded } : {}),
    ...(body.responseDepth !== undefined ? { responseDepth: body.responseDepth } : {}),
    ...(body.turnTokenBudget !== undefined ? { turnTokenBudget: body.turnTokenBudget } : {}),
    ...(expandedAttachments.length > 0 ? { attachments: expandedAttachments } : {}),
  };

  // uploads land on disk with the rest of the turn's lineage (Law 6)
  for (const file of request.attachments ?? []) {
    const savedPath = saveUpload(
      deps.config.paths.uploadsDir,
      request.sessionId,
      new Date().toISOString().replace(/[:.]/g, '-'),
      file,
    );
    log.info('server.upload.saved', `Upload "${file.name}" (${file.textContent.length} bytes) saved`, {
      sessionId: request.sessionId,
      data: { savedPath },
    });
  }

  let pack;
  let model: string;
  let toolset;
  try {
    pack = loadDomainPack(deps.config.paths.domainsDir, request.domainId);
    // Same call runTurn.ts makes with the same watcher config — deterministic, so
    // the model picked here and the tier recorded in lineage always agree (Law 6).
    model = requireModel(
      deps.config,
      resolveEffectiveTier(request, pack, {
        autoTierEnabled: deps.config.watcher.autoTierEnabled,
        autoTierEscalationTokens: deps.config.watcher.autoTierEscalationTokens,
      }).tier,
    );
    // Grounded-knowledge POC: the knowledge tool is wired in only for this turn's
    // request, never as a pack default (Law 1 — no silent always-on behaviour).
    const grounding = resolveGrounding(request, pack);
    // Per-request override wins, but never past the hard ceiling regardless
    // of what the client asks for (Phase 6 agentMaxTurns control).
    const effectiveMaxTurns = resolveEffectiveAgentMaxTurns(
      body.agentMaxTurns,
      deps.config.agentLoop.maxTurns,
    );
    toolset = resolveToolset({
      packToolIds: grounding.grounded ? [...pack.tools, GROUNDING_TOOL_ID] : pack.tools,
      agentLoop: {
        availableTools: deps.config.agentLoop.availableTools,
        allowedTools: deps.config.agentLoop.allowedTools,
        maxTurns: effectiveMaxTurns,
        permissionMode: deps.config.agentLoop.permissionMode,
      },
      catalog: loadConnectorCatalog(),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    log.error('server.turn.rejected', `Turn rejected before start: ${message}`);
    writeJson(res, 422, { error: message });
    return;
  }

  log.info(
    'server.turn.registry',
    `Registry wired ${toolset.wired.length} pack tools → [${toolset.toolPolicy.availableTools.join(', ')}] (maxTurns ${toolset.toolPolicy.maxTurns})`,
    {
      sessionId: request.sessionId,
      data: {
        registryVersion: toolset.registryVersion,
        mcpServers: toolset.mcpServers.map((server) => server.serverId),
        maxTurns: toolset.toolPolicy.maxTurns,
      },
    },
  );

  res.writeHead(200, { ...SSE_HEADERS, 'X-Session-Id': request.sessionId });

  // Constructive, visible attachment notes (e.g. a zip's binary entries were
  // skipped) — reuses the existing activity-stream event types rather than a
  // new one; renders in the GUI's own "real working steps" surface, never a
  // silently-dropped file.
  if (attachmentWarnings.length > 0) {
    const activityId = randomUUID();
    writeSseEvent(res, { type: 'activity-start', activityId, kind: 'stage', label: 'Attachment file note' });
    writeSseEvent(res, { type: 'activity-delta', activityId, text: attachmentWarnings.join('\n') });
    writeSseEvent(res, { type: 'activity-end', activityId });
  }

  // snapshot history BEFORE the turn — the Watcher appends this turn itself
  const history = [...deps.sessions.history(request.sessionId)];

  // Client Stop aborts fetch → response closes unfinished → seize the SDK run.
  // Do NOT listen to req 'close' after the body is read — that fires on every turn.
  const turnAbort = new AbortController();
  const onClientGone = (): void => {
    if (!turnAbort.signal.aborted) {
      log.info('server.turn.client_abort', 'Client disconnected — seizing model run', {
        sessionId: request.sessionId,
      });
      turnAbort.abort();
    }
  };
  const onResponseClose = (): void => {
    if (!res.writableFinished) onClientGone();
  };
  req.once('aborted', onClientGone);
  res.once('close', onResponseClose);

  try {
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
        autoTierEnabled: deps.config.watcher.autoTierEnabled,
        autoTierEscalationTokens: deps.config.watcher.autoTierEscalationTokens,
        ...(deps.config.models.fast !== undefined ? { fastModel: deps.config.models.fast } : {}),
      },
      toolPolicy: toolset.toolPolicy,
      workspaceDir: deps.config.paths.repoRoot,
      datasetsDir: deps.config.paths.datasetsDir,
      domainsDir: deps.config.paths.domainsDir,
      mcpServers: toolset.mcpServers,
      wiredTools: toolset.wired,
      registryVersion: toolset.registryVersion,
      abortSignal: turnAbort.signal,
      log: deps.logger.child('watcher'),
      promptHistoryDir: deps.config.paths.promptHistoryDir,
      tokenTelemetryDir: deps.config.paths.tokenTelemetryDir,
      artefactsDir: deps.config.paths.artefactsDir,
    })) {
      if (turnAbort.signal.aborted || res.writableEnded) break;
      writeSseEvent(res, event);
    }
  } finally {
    req.off('aborted', onClientGone);
    res.off('close', onResponseClose);
    if (!res.writableEnded) res.end();
  }
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
