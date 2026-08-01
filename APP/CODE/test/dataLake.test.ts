import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { listAppointments } from '../src/tools/handlers/calendar.js';
import { listDatasets, parseCsv, summarizeCsv } from '../src/tools/handlers/dataLake.js';

describe('parseCsv', () => {
  it('parses quoted commas', () => {
    const { headers, rows } = parseCsv('a,b\n"1,2",3\n');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['1,2', '3']]);
  });
});

describe('data lake handlers', () => {
  it('lists and summarises the shipped finance ledger fixture', () => {
    const datasetsDir = loadConfig().paths.datasetsDir;
    const listed = listDatasets(datasetsDir);
    expect(listed.some((d) => d.relativePath === 'finance/rd-ledger-ry2024.csv')).toBe(true);

    const summary = summarizeCsv(datasetsDir, 'finance/rd-ledger-ry2024.csv');
    expect(summary.rowCount).toBe(5);
    expect(summary.numericSums.total_cost).toBeCloseTo(472156.11, 2);
    expect(summary.headers).toContain('bucket');
  });

  it('refuses path escape', () => {
    const root = mkdtempSync(join(tmpdir(), 'protean-dl-'));
    expect(() => summarizeCsv(root, '../secret.csv')).toThrow(/\.\./);
  });

  it('summarises a tiny local CSV', () => {
    const root = mkdtempSync(join(tmpdir(), 'protean-dl-'));
    mkdirSync(join(root, 'finance'), { recursive: true });
    writeFileSync(join(root, 'finance', 'tiny.csv'), 'name,amount\na,1.5\nb,2.5\n', 'utf8');
    const summary = summarizeCsv(root, 'finance/tiny.csv');
    expect(summary.rowCount).toBe(2);
    expect(summary.numericSums.amount).toBe(4);
  });
});

describe('calendar handler', () => {
  it('lists appointments from the medical fixture', () => {
    const datasetsDir = loadConfig().paths.datasetsDir;
    const listing = listAppointments(datasetsDir);
    expect(listing.clinicId).toBe('demo-gp-south');
    expect(listing.appointments.length).toBeGreaterThanOrEqual(2);
    const day = listAppointments(datasetsDir, 'medical/clinic-calendar.json', '2026-08-03');
    expect(day.appointments).toHaveLength(2);
  });
});
