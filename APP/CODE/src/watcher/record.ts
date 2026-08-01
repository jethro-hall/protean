import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TurnLineage } from '../contracts/turn.js';
import { redactValue } from '../logging/redact.js';

/**
 * Watcher step 5 — RECORD (pure code, Law 6). Full turn lineage to
 * LLMBUILD_DATA/prompt-history and the per-call numbers to
 * LLMBUILD_DATA/token-telemetry, one JSONL row per turn, day-partitioned.
 */
export interface TelemetryRow {
  ts: string;
  turnId: string;
  sessionId: string;
  domainId: string;
  model: string;
  /** Watcher exact-answer cache hit (no model call). */
  cacheHit: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  /** Provider API usage — never estimated. */
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  /** Provider-reported USD (SDK total_cost_usd). */
  costUsd: number | null;
}

function dayFileName(now: Date): string {
  return `${now.toISOString().slice(0, 10)}.jsonl`;
}

function appendJsonl(dir: string, row: unknown): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, dayFileName(new Date()));
  appendFileSync(path, JSON.stringify(redactValue(row)) + '\n', 'utf8');
  return path;
}

export function recordLineage(promptHistoryDir: string, lineage: TurnLineage): string {
  return appendJsonl(promptHistoryDir, lineage);
}

export function recordTelemetry(tokenTelemetryDir: string, row: TelemetryRow): string {
  return appendJsonl(tokenTelemetryDir, row);
}

/** One embedding gateway call (Phase N) -- measured like every other provider call (Law 6), never assumed free. */
export interface EmbeddingTelemetryRow {
  ts: string;
  provider: string;
  model: string;
  /** Which collection this batch was embedding for, when known (ingestion/hybrid-search query calls both pass it). */
  collectionId: string | null;
  textCount: number;
  totalTokens: number;
}

export function recordEmbeddingTelemetry(
  embeddingTelemetryDir: string,
  row: EmbeddingTelemetryRow,
): string {
  return appendJsonl(embeddingTelemetryDir, row);
}
