import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSessionSummaries } from '../src/watcher/sessionSummaries.js';

function lineageRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    turnId: 'turn-x',
    sessionId: 's1',
    domainId: 'finance',
    startedAt: '2026-08-01T00:00:00.000Z',
    input: 'hello',
    output: 'hi',
    model: 'sonnet',
    usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0.01,
    ...overrides,
  };
}

function writeDayFile(dir: string, name: string, rows: Array<Record<string, unknown>>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

describe('listSessionSummaries', () => {
  it('returns empty when the prompt-history dir does not exist yet (fresh install)', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'protean-lineage-')), 'does-not-exist');
    expect(listSessionSummaries(dir)).toEqual([]);
  });

  it('groups multiple turns by sessionId and sums cost/tokens across them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-lineage-'));
    writeDayFile(dir, '2026-08-01.jsonl', [
      lineageRow({ sessionId: 's1', startedAt: '2026-08-01T00:00:00.000Z', input: 'first question', costUsd: 0.01 }),
      lineageRow({ sessionId: 's1', startedAt: '2026-08-01T00:05:00.000Z', input: 'second question', costUsd: 0.02 }),
      lineageRow({ sessionId: 's2', startedAt: '2026-08-01T00:01:00.000Z', input: 'other session', costUsd: 0.05 }),
    ]);

    const summaries = listSessionSummaries(dir);
    expect(summaries).toHaveLength(2);

    const s1 = summaries.find((s) => s.id === 's1');
    expect(s1).toMatchObject({
      title: 'first question',
      domainId: 'finance',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:05:00.000Z',
      turnCount: 2,
      totalCostUsd: 0.03,
      totalInputTokens: 20,
      totalOutputTokens: 40,
    });
  });

  it('sorts sessions newest-updated first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-lineage-'));
    writeDayFile(dir, '2026-08-01.jsonl', [
      lineageRow({ sessionId: 'old', startedAt: '2026-08-01T00:00:00.000Z' }),
      lineageRow({ sessionId: 'new', startedAt: '2026-08-02T00:00:00.000Z' }),
    ]);
    expect(listSessionSummaries(dir).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('reads across multiple day-partitioned files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-lineage-'));
    writeDayFile(dir, '2026-08-01.jsonl', [lineageRow({ sessionId: 's1', startedAt: '2026-08-01T00:00:00.000Z' })]);
    writeDayFile(dir, '2026-08-02.jsonl', [lineageRow({ sessionId: 's1', startedAt: '2026-08-02T00:00:00.000Z' })]);
    const summaries = listSessionSummaries(dir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.turnCount).toBe(2);
    expect(summaries[0]?.updatedAt).toBe('2026-08-02T00:00:00.000Z');
  });

  it('truncates a long first input into a title and collapses whitespace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-lineage-'));
    const longInput = `${'word '.repeat(30).trim()}\nmore text on a new line`;
    writeDayFile(dir, '2026-08-01.jsonl', [lineageRow({ sessionId: 's1', input: longInput })]);
    const title = listSessionSummaries(dir)[0]?.title ?? '';
    expect(title.length).toBeLessThanOrEqual(81);
    expect(title).not.toContain('\n');
  });

  it('treats a turn with null usage/cost as zero rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-lineage-'));
    writeDayFile(dir, '2026-08-01.jsonl', [lineageRow({ sessionId: 's1', usage: null, costUsd: null })]);
    const summary = listSessionSummaries(dir)[0];
    expect(summary).toMatchObject({ totalCostUsd: 0, totalInputTokens: 0, totalOutputTokens: 0 });
  });
});
