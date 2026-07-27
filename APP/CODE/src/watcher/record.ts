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
  cacheHit: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
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
