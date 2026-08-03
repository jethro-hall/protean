import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TurnLineage } from '../contracts/turn.js';

/**
 * Session-list summaries for the GUI's conversations rail — derived entirely
 * from already-recorded turn lineage (LLMBUILD_DATA/prompt-history), nothing
 * new tracked (Law 4: deterministic, and Law 6: the numbers here are the same
 * evidence already logged for every turn, never re-estimated).
 */
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

function readLineageRows(promptHistoryDir: string): TurnLineage[] {
  let files: string[];
  try {
    files = readdirSync(promptHistoryDir).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const rows: TurnLineage[] = [];
  for (const file of files) {
    const raw = readFileSync(join(promptHistoryDir, file), 'utf8');
    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue;
      rows.push(JSON.parse(line) as TurnLineage);
    }
  }
  return rows;
}

function truncateTitle(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max).trimEnd()}…` : oneLine;
}

/** One summary row per distinct sessionId seen in the lineage log, newest first. */
export function listSessionSummaries(promptHistoryDir: string): SessionSummary[] {
  const bySession = new Map<string, TurnLineage[]>();
  for (const row of readLineageRows(promptHistoryDir)) {
    const list = bySession.get(row.sessionId) ?? [];
    list.push(row);
    bySession.set(row.sessionId, list);
  }

  const summaries: SessionSummary[] = [];
  for (const [sessionId, turns] of bySession) {
    const sorted = [...turns].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) continue;
    summaries.push({
      id: sessionId,
      title: truncateTitle(first.input),
      domainId: last.domainId,
      createdAt: first.startedAt,
      updatedAt: last.startedAt,
      turnCount: sorted.length,
      totalCostUsd: sorted.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0),
      totalInputTokens: sorted.reduce((sum, turn) => sum + (turn.usage?.inputTokens ?? 0), 0),
      totalOutputTokens: sorted.reduce((sum, turn) => sum + (turn.usage?.outputTokens ?? 0), 0),
    });
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
