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
