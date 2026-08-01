/**
 * Engine API client. Mirrors APP/CODE contracts (turn events over SSE).
 * The GUI talks only to the Protean engine — never a provider (Law 5).
 */
export type ModelTier = 'fast' | 'strong';

/** Friendly response-depth presets (Phase 6). Mirrors src/contracts/turn.ts responseDepthSchema. */
export type ResponseDepth = 'hscLevel' | 'uniDegree' | 'professor';

export interface TurnTimings {
  assembleMs?: number;
  cacheCheckMs?: number;
  ttftMs?: number;
  modelMs?: number;
  totalMs?: number;
}

export interface TurnDone {
  turnId: string;
  cacheHit: boolean;
  model: string;
  timings: TurnTimings;
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
