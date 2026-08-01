import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

/**
 * Deterministic data-lake handlers (Law 4). No LLM. CSV only for Phase 5 proof.
 * Paths are confined to datasetsRoot — never escape (sandbox seam for file tools).
 */

export interface DatasetListing {
  relativePath: string;
  bytes: number;
  modifiedAt: string;
}

export interface CsvSummary {
  relativePath: string;
  headers: string[];
  rowCount: number;
  /** Numeric column sums for columns that parse cleanly as numbers on every non-empty cell. */
  numericSums: Record<string, number>;
  /** First N data rows as objects (capped for token leanness). */
  sampleRows: Record<string, string>[];
}

function assertUnderRoot(datasetsRoot: string, relativePath: string): string {
  const root = resolve(datasetsRoot);
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned === '' || cleaned.includes('..')) {
    throw new Error(`Dataset path must be relative and may not contain "..": "${relativePath}"`);
  }
  const absolute = resolve(root, cleaned);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new Error(`Dataset path escapes datasets root: "${relativePath}"`);
  }
  return absolute;
}

function walkCsvFiles(dir: string, root: string, out: DatasetListing[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCsvFiles(full, root, out);
      continue;
    }
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.csv') continue;
    const st = statSync(full);
    out.push({
      relativePath: relative(root, full).replace(/\\/g, '/'),
      bytes: st.size,
      modifiedAt: st.mtime.toISOString(),
    });
  }
}

/** List CSV datasets under the configured datasets root. */
export function listDatasets(datasetsRoot: string): DatasetListing[] {
  const root = resolve(datasetsRoot);
  if (!existsSync(root)) return [];
  const out: DatasetListing[] = [];
  walkCsvFiles(root, root, out);
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/** Minimal RFC4180-ish CSV parse (quoted fields, commas). No streaming — POC size. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    // skip fully empty trailing lines
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      continue;
    }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...data] = rows;
  return { headers: headerRow ?? [], rows: data };
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalised = trimmed.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}

export function summarizeCsv(
  datasetsRoot: string,
  relativePath: string,
  sampleLimit = 8,
): CsvSummary {
  const absolute = assertUnderRoot(datasetsRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Dataset not found: ${relativePath}`);
  }
  if (extname(basename(absolute)).toLowerCase() !== '.csv') {
    throw new Error(`Only .csv datasets are supported (got ${relativePath})`);
  }
  const { headers, rows } = parseCsv(readFileSync(absolute, 'utf8'));
  const numericSums: Record<string, number> = {};
  const numericEligible = new Set(headers);

  for (const cells of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i]!;
      if (!numericEligible.has(header)) continue;
      const raw = cells[i] ?? '';
      if (raw.trim() === '') continue;
      const amount = parseAmount(raw);
      if (amount === null) {
        numericEligible.delete(header);
        delete numericSums[header];
        continue;
      }
      numericSums[header] = (numericSums[header] ?? 0) + amount;
    }
  }

  const sampleRows = rows.slice(0, sampleLimit).map((cells) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]!] = cells[i] ?? '';
    }
    return obj;
  });

  return {
    relativePath: relativePath.replace(/\\/g, '/'),
    headers,
    rowCount: rows.length,
    numericSums,
    sampleRows,
  };
}
