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
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_ZIP_BYTES,
  resolveEffectiveAgentMaxTurns,
  SSE_HEADERS,
} from './config/defaults.js';
import { loadDomainPackWithOverlay, listDomainPacksWithOverlay } from './config/domainPacks.js';
import { domainPackSchema } from './contracts/domainPack.js';
import { listKnowledgeCollectionsWithOverlay } from './config/knowledgeCollections.js';
import { extractPdfText } from './tools/ingestion/pdfExtract.js';
import { chunkText } from './tools/ingestion/chunkText.js';
import { proposeChunkMetadata } from './tools/authoring/proposeChunkMetadata.js';
import { proposePackDraft } from './tools/authoring/proposePackDraft.js';
import { verifyChunkFidelity } from './tools/authoring/verifyChunkFidelity.js';
import type { ExtractedPage } from './tools/ingestion/pdfExtract.js';
import { knowledgeChunkSchema, knowledgeCollectionSchema } from './contracts/knowledge.js';
import { createVoyageEmbeddingGateway } from './gateway/embeddings/voyageAdapter.js';
import { createPgvectorStore } from './gateway/vectorStore/pgvectorAdapter.js';
import { recordEmbeddingTelemetry } from './watcher/record.js';
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
  deleteDomainPackOverlayEntry,
  getProviderConfig,
  getProviderRecord,
  listProviders,
  readMcpOverlay,
  saveMcpOverlayEntry,
  saveDomainPackOverlayEntry,
  saveKnowledgeCollectionOverlayEntry,
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
    pack = loadDomainPackWithOverlay(deps.config.paths.runtimeConfigDir, deps.config.paths.domainsDir, request.domainId);
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
      runtimeConfigDir: deps.config.paths.runtimeConfigDir,
      groundingConfig: deps.config.grounding,
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
  const ids = listDomainPacksWithOverlay(deps.config.paths.runtimeConfigDir, deps.config.paths.domainsDir);
  const packs = ids.map((id) => {
    const pack = loadDomainPackWithOverlay(deps.config.paths.runtimeConfigDir, deps.config.paths.domainsDir, id);
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

// ---------------------------------------------------------------------------
// Settings: Domain Packs (Phase 6). Overlay-backed CRUD -- editing a built-in
// pack (finance/medical/generic) shadows it without mutating the checked-in
// pack.json; a pack with no checked-in file lives purely in the overlay.
// ---------------------------------------------------------------------------

function handleGetDomainPack(deps: AppDeps, id: string, res: ServerResponse): void {
  try {
    const pack = loadDomainPackWithOverlay(deps.config.paths.runtimeConfigDir, deps.config.paths.domainsDir, id);
    writeJson(res, 200, { pack });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    writeJson(res, 404, { error: message });
  }
}

async function handleSaveDomainPack(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = domainPackSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid domain pack: ${parsed.error.message}` });
    return;
  }
  const record = saveDomainPackOverlayEntry(deps.config.paths.runtimeConfigDir, parsed.data);
  writeJson(res, 200, { ok: true, pack: record.pack });
}

function handleDeleteDomainPack(deps: AppDeps, id: string, res: ServerResponse): void {
  const removed = deleteDomainPackOverlayEntry(deps.config.paths.runtimeConfigDir, id);
  if (!removed) {
    writeJson(res, 404, { error: `No saved domain pack override with id "${id}".` });
    return;
  }
  writeJson(res, 200, { ok: true });
}

/** Every known knowledge collection id, checked-in + overlay (Phase 6 domain-pack editor's weighting UI, Phase P PDF-built collections). */
function handleListKnowledgeCollections(deps: AppDeps, res: ServerResponse): void {
  writeJson(res, 200, {
    collections: listKnowledgeCollectionsWithOverlay(deps.config.paths.runtimeConfigDir, deps.config.paths.domainsDir),
  });
}

// ---------------------------------------------------------------------------
// Grounded Knowledge v2 Phase O: deterministic PDF ingestion. Extracts +
// chunks a PDF into DRAFT KnowledgeChunk[] -- nothing is saved to a pack,
// embedded, or written to pgvector here. Same result shape as
// ProviderAdminResult ({ok, message, log}) so the GUI can reuse
// AdminResultPanel, plus the draft chunks themselves.
// ---------------------------------------------------------------------------

const ingestKnowledgeBodySchema = z.object({
  fileName: z.string().min(1),
  base64Pdf: z.string().min(1),
});

async function handleIngestKnowledge(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = ingestKnowledgeBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid ingest request: ${parsed.error.message}` });
    return;
  }
  const { fileName, base64Pdf } = parsed.data;
  if (base64Pdf.length > MAX_PDF_BYTES) {
    writeJson(res, 400, {
      error: `"${fileName}" is ${(base64Pdf.length / 1024 / 1024).toFixed(1)} MB encoded -- the limit is ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
    });
    return;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Pdf, 'base64');
  } catch {
    writeJson(res, 400, { error: `"${fileName}": base64Pdf is not valid base64.` });
    return;
  }

  const extracted = await extractPdfText(buffer);
  if (!extracted.ok) {
    writeJson(res, 200, { ok: false, message: extracted.reason, chunks: [], log: [extracted.reason] });
    return;
  }
  if (extracted.result.pages.length > MAX_PDF_PAGES) {
    const message = `"${fileName}" has ${extracted.result.pages.length} pages -- the limit is ${MAX_PDF_PAGES}.`;
    writeJson(res, 200, { ok: false, message, chunks: [], log: [message] });
    return;
  }

  const chunks = chunkText(extracted.result.pages, {
    sourceTitle: fileName,
    sourceFileRef: fileName,
    fetchedAt: new Date().toISOString().slice(0, 10),
  });
  const message = `Extracted ${chunks.length} draft chunk(s) from ${extracted.result.pages.length} page(s), ${extracted.result.totalChars} characters total. Review before saving -- nothing is written to a pack yet.`;
  // Raw pages are returned too (not just chunks) so the GUI can run the LLM
  // fidelity check (verify-fidelity) against the actual source text, not a
  // re-derived approximation of it.
  writeJson(res, 200, { ok: true, message, chunks, pages: extracted.result.pages, log: [message] });
}

// ---------------------------------------------------------------------------
// Grounded Knowledge v2 Phase P: LLM-assisted authoring, mandatory human
// review. Every route here returns DRAFT proposals only -- nothing saves
// until POST /api/settings/knowledge/save-collection is called explicitly
// with the human-approved final chunks.
// ---------------------------------------------------------------------------

/** Prefer the fast tier for authoring proposals (well-scoped, low-creativity task); fall back to strong. */
function resolveAuthoringModel(config: ProteanConfig): string {
  if (config.models.fast !== undefined) return requireModel(config, 'fast');
  return requireModel(config, 'strong');
}

const proposeChunksBodySchema = z.object({
  chunks: z.array(knowledgeChunkSchema).min(1),
});

async function handleProposeChunkMetadata(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = proposeChunksBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid propose request: ${parsed.error.message}` });
    return;
  }
  try {
    const model = resolveAuthoringModel(deps.config);
    const result = await proposeChunkMetadata(deps.gateway, model, parsed.data.chunks, deps.logger.child('authoring'));
    const message = `Proposed metadata for ${result.proposals.length} of ${parsed.data.chunks.length} chunk(s). Review each against its source before saving.`;
    writeJson(res, 200, { ok: true, message, proposals: result.proposals, log: [message, ...result.warnings] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    writeJson(res, 200, { ok: false, message, proposals: [], log: [message] });
  }
}

const extractedPageSchema = z.object({ pageNumber: z.number().int().positive(), text: z.string() });

const verifyFidelityBodySchema = z.object({
  pages: z.array(extractedPageSchema).min(1),
  chunks: z.array(knowledgeChunkSchema).min(1),
});

/**
 * LLM oversight check (owner-directed): runs automatically right after ingest,
 * before a human reviews anything, comparing the deterministic chunker's
 * output against the raw source text it was built from. Best-effort -- a
 * failed check is reported honestly (never silently skipped, never blocks
 * review), matching every other degrade-gracefully path in this pipeline.
 */
async function handleVerifyChunkFidelity(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = verifyFidelityBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid verify-fidelity request: ${parsed.error.message}` });
    return;
  }
  try {
    const model = resolveAuthoringModel(deps.config);
    const report = await verifyChunkFidelity(
      deps.gateway,
      model,
      parsed.data.pages as ExtractedPage[],
      parsed.data.chunks,
      deps.logger.child('authoring'),
    );
    const message =
      report.verdict === 'clean'
        ? 'Completeness check found no gaps -- every chunk traces back to the source text.'
        : `Completeness check found ${report.missingFacts.length} possible omission(s) and ${report.suspiciousAdditions.length} possible addition(s) -- review before saving.`;
    writeJson(res, 200, { ok: true, message, report, log: [message] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    writeJson(res, 200, { ok: false, message, report: null, log: [message] });
  }
}

const proposePackBodySchema = z.object({
  documentTitle: z.string().min(1),
  sections: z.array(z.object({ heading: z.string().min(1), summary: z.string().min(1) })).min(1),
});

async function handleProposePackDraft(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = proposePackBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid propose-pack request: ${parsed.error.message}` });
    return;
  }
  try {
    const model = resolveAuthoringModel(deps.config);
    const draft = await proposePackDraft(deps.gateway, model, parsed.data);
    const message = 'Pack draft proposed from the reviewed section headings/summaries -- review before saving.';
    writeJson(res, 200, { ok: true, message, draft, log: [message] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    writeJson(res, 200, { ok: false, message, draft: null, log: [message] });
  }
}

const saveKnowledgeCollectionBodySchema = knowledgeCollectionSchema;

/**
 * The one route that actually persists anything from this whole pipeline --
 * everything before this point (ingest/propose/propose-pack) returns drafts
 * only. Saves the collection unconditionally (so keyword/TF-IDF search works
 * immediately); embedding generation is best-effort and reported honestly if
 * it fails or isn't configured, never silently skipped.
 */
async function handleSaveKnowledgeCollection(deps: AppDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = saveKnowledgeCollectionBodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    writeJson(res, 400, { error: `Invalid knowledge collection: ${parsed.error.message}` });
    return;
  }
  const collection = parsed.data;
  saveKnowledgeCollectionOverlayEntry(deps.config.paths.runtimeConfigDir, collection);

  const log: string[] = [`Saved collection "${collection.id}" with ${collection.chunks.length} chunk(s) -- keyword search available immediately.`];
  const { pg, voyageApiKey, embeddingModel } = deps.config.grounding;
  if (pg === undefined || voyageApiKey === undefined) {
    log.push('No Postgres/VOYAGE_API_KEY configured -- saved without embeddings; keyword search still works, semantic search will not until configured.');
  } else {
    try {
      const embeddingGateway = createVoyageEmbeddingGateway(voyageApiKey, embeddingModel);
      const vectorStore = createPgvectorStore(pg);
      const embedded = await embeddingGateway.embed({
        texts: collection.chunks.map((chunk) => chunk.text),
        inputType: 'document',
      });
      for (let i = 0; i < collection.chunks.length; i++) {
        const chunk = collection.chunks[i]!;
        const embedding = embedded.embeddings[i];
        if (embedding === undefined) continue;
        await vectorStore.upsertChunkEmbedding({
          chunkId: chunk.id,
          collectionId: collection.id,
          embedding,
          model: embedded.model,
        });
      }
      recordEmbeddingTelemetry(deps.config.paths.embeddingTelemetryDir, {
        ts: new Date().toISOString(),
        provider: embeddingGateway.provider,
        model: embedded.model,
        collectionId: collection.id,
        textCount: collection.chunks.length,
        totalTokens: embedded.totalTokens,
      });
      log.push(`Embedded ${collection.chunks.length} chunk(s) with ${embedded.model} -- semantic search available immediately.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      log.push(`Collection saved, but embeddings could not be generated (${message}) -- keyword search still works.`);
    }
  }
  writeJson(res, 200, { ok: true, message: log[0], log });
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
    if (req.method === 'POST' && url.pathname === '/api/settings/domains') {
      void handleSaveDomainPack(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/settings/domains/')) {
      const id = url.pathname.slice('/api/settings/domains/'.length);
      if (id !== '') {
        handleGetDomainPack(deps, id, res);
        return;
      }
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/settings/domains/')) {
      const id = url.pathname.slice('/api/settings/domains/'.length);
      if (id !== '') {
        handleDeleteDomainPack(deps, id, res);
        return;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/settings/knowledge-collections') {
      handleListKnowledgeCollections(deps, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/knowledge/ingest') {
      void handleIngestKnowledge(req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/knowledge/propose') {
      void handleProposeChunkMetadata(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/knowledge/verify-fidelity') {
      void handleVerifyChunkFidelity(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/knowledge/propose-pack') {
      void handleProposePackDraft(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/knowledge/save-collection') {
      void handleSaveKnowledgeCollection(deps, req, res).catch((cause: unknown) => {
        writeJson(res, 500, { error: cause instanceof Error ? cause.message : String(cause) });
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
