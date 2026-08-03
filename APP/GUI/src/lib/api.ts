/**
 * Engine API client. Mirrors APP/CODE contracts (turn events over SSE).
 * The GUI talks only to the Protean engine — never a provider (Law 5).
 */
export type ModelTier = 'fast' | 'strong';

/** Friendly response-depth presets (Phase 6). Mirrors src/contracts/turn.ts responseDepthSchema. */
export type ResponseDepth = 'hscLevel' | 'uniDegree' | 'professor';

/** Reasoning effort (Phase 6). Mirrors src/contracts/turn.ts effortLevelSchema — a real Claude Agent SDK field. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface TurnTimings {
  assembleMs?: number;
  cacheCheckMs?: number;
  ttftMs?: number;
  modelMs?: number;
  totalMs?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface TurnDone {
  turnId: string;
  cacheHit: boolean;
  model: string;
  timings: TurnTimings;
  usage: TokenUsage | null;
  costUsd: number | null;
  /** Citation-honesty audit (Phase R) — phrases claiming a lookup with no tool call to back it. */
  unverifiedCitationClaims?: string[];
  /** Deterministic, code-computed grounding-confidence gate (Phase R). Absent = no concern. */
  groundingConfidence?: 'low' | 'none';
}

export type ArtefactType = 'html' | 'markdown' | 'code' | 'text';

/**
 * File attached to a turn (mirrors APP/CODE attachmentSchema). `encoding:
 * 'utf8'` (default) is plain text; `encoding: 'base64'` is a zip archive —
 * the engine unpacks it server-side into individual text attachments.
 */
export interface Attachment {
  name: string;
  mimeType: string;
  encoding?: 'utf8' | 'base64';
  textContent: string;
}

export type ActivityKind = 'thinking' | 'tool' | 'stage';

export type TurnStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'activity-start'; activityId: string; kind: ActivityKind; label: string }
  | { type: 'activity-delta'; activityId: string; text: string }
  | { type: 'activity-end'; activityId: string }
  | { type: 'artefact-start'; artefactId: string; artefactType: ArtefactType; title: string }
  | { type: 'artefact-delta'; artefactId: string; text: string }
  | { type: 'artefact-end'; artefactId: string; complete: boolean; savedPath: string | null }
  /**
   * A turn ending in a genuine blocking question (Phase S) — the model choosing to end
   * its turn early, not a literal mid-generation pause (no vendor API supports that).
   */
  | { type: 'clarification-start'; clarificationId: string }
  | { type: 'clarification-delta'; clarificationId: string; text: string }
  | { type: 'clarification-end'; clarificationId: string; complete: boolean }
  | ({ type: 'done' } & TurnDone)
  | { type: 'error'; turnId: string; message: string };

export interface DomainSummary {
  id: string;
  displayName: string;
  version: string;
}

export async function fetchDomains(): Promise<DomainSummary[]> {
  const res = await fetch('/api/domains');
  if (!res.ok) throw new Error(`Domain list failed (${res.status})`);
  const body = (await res.json()) as { domains: DomainSummary[] };
  return body.domains;
}

// ---------------------------------------------------------------------------
// Saved conversations. Mirrors src/watcher/sessionSummaries.ts — a read
// surface over history that already persists (Phase 2) and lineage that's
// already logged (Law 6), not a new store.
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  title: string;
  domainId: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface SavedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error(`Saved-conversation list failed (${res.status})`);
  const body = (await res.json()) as { sessions: SessionSummary[] };
  return body.sessions;
}

export async function fetchSessionMessages(id: string): Promise<SavedMessage[]> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Saved conversation "${id}" failed to load (${res.status})`);
  const body = (await res.json()) as { messages: SavedMessage[] };
  return body.messages;
}

/** Surface the engine's human error message, not raw JSON (UX: wording makes sense). */
export function extractErrorMessage(rawBody: string, status: number): string {
  try {
    const parsed = JSON.parse(rawBody) as { error?: string };
    if (typeof parsed.error === 'string' && parsed.error !== '') return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return rawBody !== '' ? rawBody.slice(0, 300) : `The engine returned status ${status}.`;
}

/** Parse one SSE frame ("event: x\ndata: {...}") into a turn event. */
export function parseSseFrame(frame: string): TurnStreamEvent | null {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
  if (dataLine === undefined) return null;
  try {
    return JSON.parse(dataLine.slice('data:'.length).trim()) as TurnStreamEvent;
  } catch {
    return null;
  }
}

export interface StreamTurnParams {
  input: string;
  sessionId: string;
  domainId: string;
  tier: ModelTier;
  attachments?: Attachment[];
  /** Grounded-knowledge POC tickbox (Phase 6). Omitted/false = standard behaviour. */
  grounded?: boolean;
  /** Friendly depth preset (Phase 6). Omitted = platform standard. */
  responseDepth?: ResponseDepth;
  /** Advanced manual override — wins over responseDepth's own budget. */
  turnTokenBudget?: number;
  /** Advanced per-request override of the agent-loop step ceiling. Omitted = server default. */
  agentMaxTurns?: number;
  /** Quick model picker (Phase 6): answer via this saved custom provider instead of `tier`. */
  providerId?: string;
  /** Reasoning effort (Phase 6) — built-in Fast/Strong tiers only, a no-op for a custom provider. */
  effort?: EffortLevel;
  /** Sampling temperature (Phase 6) — custom providers only, a no-op for the built-in tiers. */
  temperature?: number;
  /** Max response tokens (Phase 6) — custom providers only. */
  maxTokens?: number;
  onEvent: (event: TurnStreamEvent) => void;
  signal?: AbortSignal;
}

/** POST a turn and deliver each SSE event as it arrives. */
export async function streamTurn(params: StreamTurnParams): Promise<void> {
  const {
    input,
    sessionId,
    domainId,
    tier,
    attachments,
    grounded,
    responseDepth,
    turnTokenBudget,
    agentMaxTurns,
    providerId,
    effort,
    temperature,
    maxTokens,
    onEvent,
    signal,
  } = params;
  const res = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      sessionId,
      domainId,
      tier,
      ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {}),
      ...(grounded === true ? { grounded } : {}),
      ...(responseDepth !== undefined ? { responseDepth } : {}),
      ...(turnTokenBudget !== undefined ? { turnTokenBudget } : {}),
      ...(agentMaxTurns !== undefined ? { agentMaxTurns } : {}),
      ...(providerId !== undefined ? { providerId } : {}),
      ...(effort !== undefined ? { effort } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    }),
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!res.ok || res.body === null) {
    const raw = await res.text().catch(() => '');
    throw new Error(extractErrorMessage(raw, res.status));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseFrame(frame);
      if (event !== null) onEvent(event);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Settings: Providers & Models (Phase 6). Mirrors APP/CODE's
// gateway/providerAdmin/types.ts + config/runtimeSettingsStore.ts shapes.
// ---------------------------------------------------------------------------

export type ProviderType = 'anthropic' | 'bedrock' | 'openai-compatible';

export type ProviderDraftConfig =
  | { type: 'anthropic'; apiKey: string }
  | { type: 'bedrock'; awsRegion: string; bearerToken: string }
  | { type: 'openai-compatible'; baseUrl: string; apiKey: string };

export interface ProviderSummary {
  id: string;
  type: ProviderType;
  label: string;
  createdAt: string;
  detail: string;
  secretRedacted: string;
  /** Which model the quick picker sends turns to, if set. */
  model?: string;
}

export interface ProviderAdminResult {
  ok: boolean;
  message: string;
  models?: string[];
  log: string[];
}

async function settingsFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

async function settingsJson<T>(res: Response, fallbackError: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? fallbackError);
  }
  return body;
}

export async function fetchProviders(): Promise<ProviderSummary[]> {
  const res = await settingsFetch('/api/settings/providers');
  const body = await settingsJson<{ providers: ProviderSummary[] }>(res, 'Failed to load providers.');
  return body.providers;
}

export async function saveProvider(input: {
  id?: string;
  label: string;
  config: ProviderDraftConfig;
  model?: string;
}): Promise<{ id: string }> {
  const res = await settingsFetch('/api/settings/providers', { method: 'POST', body: JSON.stringify(input) });
  const body = await settingsJson<{ provider: { id: string } }>(res, 'Failed to save provider.');
  return body.provider;
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await settingsFetch(`/api/settings/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await settingsJson(res, 'Failed to delete provider.');
}

/** Test/list-models accept either a saved provider's id or a not-yet-saved draft config. */
export type ProviderRefOrDraft = { id: string } | ProviderDraftConfig;

export async function testProvider(input: ProviderRefOrDraft): Promise<ProviderAdminResult> {
  const res = await settingsFetch('/api/settings/providers/test', { method: 'POST', body: JSON.stringify(input) });
  return settingsJson<ProviderAdminResult>(res, 'Failed to test provider connection.');
}

export async function listProviderModels(input: ProviderRefOrDraft): Promise<ProviderAdminResult> {
  const res = await settingsFetch('/api/settings/providers/models', { method: 'POST', body: JSON.stringify(input) });
  return settingsJson<ProviderAdminResult>(res, 'Failed to list provider models.');
}

// ---------------------------------------------------------------------------
// Settings: MCP / Tools (Phase 6). Only stdioMcp connectors are addable this
// way -- builtin/sdkMcp require a real code-level handler in the engine.
// ---------------------------------------------------------------------------

export interface StdioMcpConnectorEntry {
  kind: 'stdioMcp';
  serverId: string;
  command: string;
  args: string[];
  envFrom: string[];
  toolNames: string[];
  description: string;
  enabled: boolean;
}

export type CatalogConnectorEntry =
  | { kind: 'builtin'; sdkTools: string[]; description: string }
  | { kind: 'sdkMcp'; serverId: string; toolNames: string[]; description: string }
  | StdioMcpConnectorEntry;

export interface McpOverlayEntry {
  connectorId: string;
  entry: StdioMcpConnectorEntry;
  createdAt: string;
}

export const STDIO_MCP_TEMPLATE: StdioMcpConnectorEntry = {
  kind: 'stdioMcp',
  serverId: 'my-mcp-server',
  command: 'npx',
  args: ['-y', '@example/mcp-server'],
  envFrom: [],
  toolNames: ['exampleTool'],
  description: 'Describe what this connector does.',
  enabled: true,
};

export async function fetchMcpConnectors(): Promise<{
  catalog: Record<string, CatalogConnectorEntry>;
  overlay: McpOverlayEntry[];
}> {
  const res = await settingsFetch('/api/settings/mcp');
  return settingsJson(res, 'Failed to load MCP connectors.');
}

export async function testMcpConnector(entry: StdioMcpConnectorEntry): Promise<ProviderAdminResult> {
  const res = await settingsFetch('/api/settings/mcp/test', { method: 'POST', body: JSON.stringify(entry) });
  return settingsJson<ProviderAdminResult>(res, 'Failed to test MCP connector.');
}

export async function saveMcpConnector(connectorId: string, entry: StdioMcpConnectorEntry): Promise<void> {
  const res = await settingsFetch('/api/settings/mcp', {
    method: 'POST',
    body: JSON.stringify({ connectorId, entry }),
  });
  await settingsJson(res, 'Failed to save MCP connector.');
}

export async function deleteMcpConnector(connectorId: string): Promise<void> {
  const res = await settingsFetch(`/api/settings/mcp/${encodeURIComponent(connectorId)}`, { method: 'DELETE' });
  await settingsJson(res, 'Failed to delete MCP connector.');
}

// ---------------------------------------------------------------------------
// Settings: Domain Packs (Phase 6). Mirrors src/contracts/domainPack.ts's
// domainPackSchema — the full editable shape, not the thin DomainSummary
// used elsewhere for the picker.
// ---------------------------------------------------------------------------

export interface DomainPackDetail {
  id: string;
  displayName: string;
  version: string;
  systemPrompt: string;
  vocabulary: Record<string, string>;
  tools: string[];
  knowledgeCollections: string[];
  /** Per-collection relevance multiplier (Phase 6 weighting) — absent id means weight 1. */
  knowledgeCollectionWeights: Record<string, number>;
  outputTemplates: Record<string, string>;
  validation: Record<string, unknown>;
  tiers: { default: ModelTier; cheapPath: ModelTier };
  examples: unknown[];
  hints: Record<string, { what: string; why: string; example?: string }>;
}

export const NEW_DOMAIN_PACK_TEMPLATE: DomainPackDetail = {
  id: '',
  displayName: '',
  version: '0.1.0',
  systemPrompt: '',
  vocabulary: {},
  tools: [],
  knowledgeCollections: [],
  knowledgeCollectionWeights: {},
  outputTemplates: {},
  validation: {},
  tiers: { default: 'strong', cheapPath: 'fast' },
  examples: [],
  hints: {},
};

export interface KnowledgeCollectionSummary {
  id: string;
  displayName: string;
}

export async function fetchDomainPackDetail(id: string): Promise<DomainPackDetail> {
  const res = await settingsFetch(`/api/settings/domains/${encodeURIComponent(id)}`);
  const body = await settingsJson<{ pack: DomainPackDetail }>(res, 'Failed to load domain pack.');
  return body.pack;
}

export async function saveDomainPack(pack: DomainPackDetail): Promise<DomainPackDetail> {
  const res = await settingsFetch('/api/settings/domains', { method: 'POST', body: JSON.stringify(pack) });
  const body = await settingsJson<{ pack: DomainPackDetail }>(res, 'Failed to save domain pack.');
  return body.pack;
}

export interface DomainPackImportResult {
  ok: boolean;
  message: string;
  pack: DomainPackDetail | null;
  mappedFields: string[];
  warnings: string[];
}

/**
 * Deterministic import of a domain-pack-shaped JSON file (Law 4 -- structural
 * field mapping, no LLM involved). Draft only: nothing saves until the human
 * reviews the returned pack in the editor and explicitly clicks Save.
 */
export async function importDomainPackJson(fileName: string, raw: string): Promise<DomainPackImportResult> {
  const res = await settingsFetch('/api/settings/domains/import', {
    method: 'POST',
    body: JSON.stringify({ fileName, raw }),
  });
  return settingsJson(res, 'Failed to import domain pack JSON.');
}

/** Reset-to-default when a checked-in pack.json still exists for this id; a real delete otherwise. */
export async function deleteDomainPackOverride(id: string): Promise<void> {
  const res = await settingsFetch(`/api/settings/domains/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await settingsJson(res, 'Failed to reset/delete domain pack.');
}

export async function fetchKnowledgeCollections(): Promise<KnowledgeCollectionSummary[]> {
  const res = await settingsFetch('/api/settings/knowledge-collections');
  const body = await settingsJson<{ collections: KnowledgeCollectionSummary[] }>(
    res,
    'Failed to load knowledge collections.',
  );
  return body.collections;
}

// ---------------------------------------------------------------------------
// Grounded Knowledge v2 Phase P: build a knowledge collection from documents,
// with mandatory human review of every LLM-authored field before anything
// saves. Mirrors src/contracts/knowledge.ts / src/contracts/authoring.ts.
// ---------------------------------------------------------------------------

export interface KnowledgeChunkDraft {
  id: string;
  heading: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  fetchedAt: string;
}

export interface ChunkProposal {
  chunkId: string;
  heading: string;
  summary: string;
}

export interface PackDraftProposal {
  displayName: string;
  systemPrompt: string;
  vocabulary: Record<string, string>;
}

export interface KnowledgeAuthoringResult {
  ok: boolean;
  message: string;
  log: string[];
}

export interface ExtractedPageDraft {
  pageNumber: number;
  text: string;
}

/** LLM oversight/completeness check result (owner-directed) -- a CHECK, never a source of truth. */
export interface ChunkFidelityReport {
  verdict: 'clean' | 'issues-found';
  missingFacts: string[];
  suspiciousAdditions: string[];
}

export async function ingestPdf(
  fileName: string,
  base64Pdf: string,
): Promise<KnowledgeAuthoringResult & { chunks: KnowledgeChunkDraft[]; pages: ExtractedPageDraft[] }> {
  const res = await settingsFetch('/api/settings/knowledge/ingest', {
    method: 'POST',
    body: JSON.stringify({ fileName, base64Pdf }),
  });
  return settingsJson(res, 'Failed to ingest PDF.');
}

/** URL-sourced ingestion (deterministic fetch + PDF/HTML extraction) — same draft shape as ingestPdf. */
export async function ingestUrl(
  url: string,
  sourceTitle?: string,
): Promise<KnowledgeAuthoringResult & { chunks: KnowledgeChunkDraft[]; pages: ExtractedPageDraft[] }> {
  const res = await settingsFetch('/api/settings/knowledge/ingest-url', {
    method: 'POST',
    body: JSON.stringify({ url, ...(sourceTitle !== undefined ? { sourceTitle } : {}) }),
  });
  return settingsJson(res, 'Failed to ingest URL.');
}

export async function verifyChunkFidelity(
  pages: ExtractedPageDraft[],
  chunks: KnowledgeChunkDraft[],
): Promise<KnowledgeAuthoringResult & { report: ChunkFidelityReport | null }> {
  const res = await settingsFetch('/api/settings/knowledge/verify-fidelity', {
    method: 'POST',
    body: JSON.stringify({ pages, chunks }),
  });
  return settingsJson(res, 'Failed to run the completeness check.');
}

export async function proposeChunkMetadata(
  chunks: KnowledgeChunkDraft[],
): Promise<KnowledgeAuthoringResult & { proposals: ChunkProposal[] }> {
  const res = await settingsFetch('/api/settings/knowledge/propose', {
    method: 'POST',
    body: JSON.stringify({ chunks }),
  });
  return settingsJson(res, 'Failed to propose chunk metadata.');
}

export async function proposePackDraft(
  documentTitle: string,
  sections: Array<{ heading: string; summary: string }>,
): Promise<KnowledgeAuthoringResult & { draft: PackDraftProposal | null }> {
  const res = await settingsFetch('/api/settings/knowledge/propose-pack', {
    method: 'POST',
    body: JSON.stringify({ documentTitle, sections }),
  });
  return settingsJson(res, 'Failed to propose pack draft.');
}

export async function saveKnowledgeCollection(
  id: string,
  displayName: string,
  chunks: KnowledgeChunkDraft[],
): Promise<KnowledgeAuthoringResult> {
  const res = await settingsFetch('/api/settings/knowledge/save-collection', {
    method: 'POST',
    body: JSON.stringify({ id, displayName, chunks }),
  });
  return settingsJson(res, 'Failed to save knowledge collection.');
}
