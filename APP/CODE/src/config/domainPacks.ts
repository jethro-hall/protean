import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { domainPackSchema, type DomainPack } from '../contracts/domainPack.js';

/**
 * Loader for Domain Packs. Packs themselves are data-only (Law 2); this is the one
 * place that reads and validates them. Invalid packs fail loudly (Law 1).
 */
export function loadDomainPack(domainsDir: string, domainId: string): DomainPack {
  const manifestPath = join(domainsDir, domainId, 'pack.json');
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (cause) {
    throw new Error(`Domain pack "${domainId}" not found at ${manifestPath}`, { cause });
  }
  const parsed = domainPackSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Domain pack "${domainId}" manifest invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** List the pack IDs available on disk (directories containing pack.json). */
export function listDomainPacks(domainsDir: string): string[] {
  return readdirSync(domainsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        readFileSync(join(domainsDir, name, 'pack.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}
