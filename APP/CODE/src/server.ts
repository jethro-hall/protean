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
import { loadConnectorCatalog, loadConnectorCatalogWithOverlay } from './config/loadConnectors.js';
import { loadConfig, requireModel, type ProteanConfig } from './config/loadConfig.js';
import { resolveToolset } from './tools/registry.js';
import {
  attachmentSchema,
  effortLevelSchema,
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
import {
  deleteProvider,
  deleteMcpOverlayEntry,
  getProviderConfig,
  getProviderRecord,
  listProviders,
  readMcpOverlay,
  saveMcpOverlayEntry,
  saveProvider,
} from './config/runtimeSettingsStore.js';
import { listProviderModels, testProviderConnection } from './gateway/providerAdmin/dispatch.js';
import type { ProviderAdminConfig } from './gateway/providerAdmin/types.js';
import { createCustomProviderGateway } from './gateway/adapters/customProvider.js';
import { createRawGatewayAgentCore } from './agent/adapters/rawGatewayAgent.js';
import { stdioMcpConnectorSchema } from './contracts/connectors.js';
import { testStdioMcpServer } from './tools/mcpAdmin.js';

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
  /** Reasoning effort (Phase 6) — built-in Fast/Strong tiers only, a real SDK field. */
  effort: effortLevelSchema.optional(),
  /** Sampling temperature (Phase 6) — custom providers only, no effect on built-in tiers. */
  temperature: z.number().min(0).max(2).optional(),
  /** Max response tokens (Phase 6) — custom providers only. */
  maxTokens: z.number().int().positive().max(32000).optional(),
  /**
   * Quick model picker (Phase 6): a saved custom provider id to answer this
   * turn instead of the built-in Fast/Strong tiers. Omitted = tier as usual.
   */
  providerId: z.string().min(1).optional(),
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
    ...(body.effort !== undefined ? { effort: body.effort } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
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
  let customAgent: AgentCore | undefined;
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
    // Quick model picker (Phase 6): a saved custom provider answers this turn
    // instead of the built-in Fast/Strong tiers -- no tool use/MCP for these,
    // an honest non-agentic path (agent/adapters/rawGatewayAgent.ts), not the
    // Claude Agent SDK loop.
    if (body.providerId !== undefined) {
      const record = getProviderRecord(deps.config.paths.runtimeConfigDir, body.providerId);
      if (record === undefined) {
        throw new Error(`No saved provider with id "${body.providerId}".`);
      }
      if (record.model === undefined) {
        throw new Error(`Provider "${record.label}" has no model selected — pick one in Settings first.`);
      }
      model = record.model;
      customAgent = createRawGatewayAgentCore(createCustomProviderGateway(record.config));
    }
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
      catalog: loadConnectorCatalogWithOverlay(deps.config.paths.runtimeConfigDir),
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
      agent: customAgent ?? deps.agent,
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

// ---------------------------------------------------------------------------
// Settings: Providers & Models (Phase 6). Admin/settings-time calls only --
// never the live chat-turn path, which still goes through
// gateway/adapters/claude.ts exclusively.
// ---------------------------------------------------------------------------

const providerConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('anthropic'), apiKey: z.string().min(1) }),
  z.object({ type: z.literal('bedrock'), awsRegion: z.string().min(1), bearerToken: z.string().min(1) }),
  z.object({ type: z.literal('openai-compatible'), baseUrl: z.url(), apiKey: z.string().min(1) }),
]);

const saveProviderBodySchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  config: providerConfigSchema,
  model: z.string().min(1).optional(),
});

/** Test/list-models accepts either a not-yet-saved draft config, or a reference to a saved one. */
const providerRefOrDraftSchema = z.union([z.object({ id: z.string().min(1) }), providerConfigSchema]);

function resolveProviderConfig(
  deps: AppDeps,
  body: z.infer<typeof providerRefOrDraftSchema>,
): ProviderAdminConfig | { error: string } {
  if ('id' in body) {
    const config = getProviderConfig(deps.config.paths.runtimeConfigDir, body.id);
    if (config === undefined) return { error: `No saved provider with id "${body.id}".` };
    return config;
  }
  return body;
}

function handleListProviders(deps: AppDeps, res: ServerResponse): void {
  writeJson(res, 200, { providers: listProviders(deps.config.paths.runtimeConfigDir) });
}

async function handleSaveProvider(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = saveProviderBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid provider: ${parsed.error.message}` });
    return;
  }
  const record = saveProvider(deps.config.paths.runtimeConfigDir, parsed.data);
  writeJson(res, 200, { ok: true, provider: record });
}

function handleDeleteProvider(deps: AppDeps, id: string, res: ServerResponse): void {
  const removed = deleteProvider(deps.config.paths.runtimeConfigDir, id);
  if (!removed) {
    writeJson(res, 404, { error: `No saved provider with id "${id}".` });
    return;
  }
  writeJson(res, 200, { ok: true });
}

async function handleTestProvider(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = providerRefOrDraftSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid provider config: ${parsed.error.message}` });
    return;
  }
  const config = resolveProviderConfig(deps, parsed.data);
  if ('error' in config) {
    writeJson(res, 404, { error: config.error });
    return;
  }
  writeJson(res, 200, await testProviderConnection(config));
}

async function handleListProviderModels(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = providerRefOrDraftSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid provider config: ${parsed.error.message}` });
    return;
  }
  const config = resolveProviderConfig(deps, parsed.data);
  if ('error' in config) {
    writeJson(res, 404, { error: config.error });
    return;
  }
  writeJson(res, 200, await listProviderModels(config));
}

// ---------------------------------------------------------------------------
// Settings: MCP / Tools (Phase 6). Only stdioMcp connectors are addable this
// way -- builtin/sdkMcp require a real code-level handler to exist (hard
// architecture fact: tools/registry.ts's SDK_MCP_HANDLER_BY_SERVER).
// ---------------------------------------------------------------------------

const connectorIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'must be letters/digits/-/_ only');

const saveMcpBodySchema = z.object({
  connectorId: connectorIdSchema,
  entry: stdioMcpConnectorSchema,
});

function handleListMcp(deps: AppDeps, res: ServerResponse): void {
  const catalog = loadConnectorCatalog();
  const overlay = readMcpOverlay(deps.config.paths.runtimeConfigDir);
  writeJson(res, 200, { catalog: catalog.connectors, overlay });
}

async function handleTestMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = stdioMcpConnectorSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid MCP server config: ${parsed.error.message}` });
    return;
  }
  const result = await testStdioMcpServer({
    command: parsed.data.command,
    args: parsed.data.args,
    envFrom: parsed.data.envFrom,
  });
  writeJson(res, 200, result);
}

async function handleSaveMcp(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = saveMcpBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid MCP server: ${parsed.error.message}` });
    return;
  }
  const record = saveMcpOverlayEntry(deps.config.paths.runtimeConfigDir, parsed.data.connectorId, parsed.data.entry);
  writeJson(res, 200, { ok: true, entry: record });
}

function handleDeleteMcp(deps: AppDeps, connectorId: string, res: ServerResponse): void {
  const removed = deleteMcpOverlayEntry(deps.config.paths.runtimeConfigDir, connectorId);
  if (!removed) {
    writeJson(res, 404, { error: `No saved MCP connector with id "${connectorId}".` });
    return;
  }
  writeJson(res, 200, { ok: true });
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
    if (req.method === 'GET' && url.pathname === '/api/settings/providers') {
      handleListProviders(deps, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/providers') {
      void handleSaveProvider(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/providers/test') {
      void handleTestProvider(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/providers/models') {
      void handleListProviderModels(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/settings/providers/')) {
      const id = url.pathname.slice('/api/settings/providers/'.length);
      if (id !== '') {
        handleDeleteProvider(deps, id, res);
        return;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/mcp') {
      handleListMcp(deps, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/mcp/test') {
      void handleTestMcp(req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/mcp') {
      void handleSaveMcp(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/settings/mcp/')) {
      const connectorId = url.pathname.slice('/api/settings/mcp/'.length);
      if (connectorId !== '') {
        handleDeleteMcp(deps, connectorId, res);
        return;
      }
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
