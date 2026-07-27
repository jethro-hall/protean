/**
 * Engine API client. Mirrors APP/CODE contracts (turn events over SSE).
 * The GUI talks only to the Protean engine — never a provider (Law 5).
 */
export type ModelTier = 'fast' | 'strong';

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

export type TurnStreamEvent =
  | { type: 'text'; text: string }
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
  onEvent: (event: TurnStreamEvent) => void;
  signal?: AbortSignal;
}

/** POST a turn and deliver each SSE event as it arrives. */
export async function streamTurn(params: StreamTurnParams): Promise<void> {
  const { input, sessionId, domainId, tier, onEvent, signal } = params;
  const res = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, sessionId, domainId, tier }),
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
