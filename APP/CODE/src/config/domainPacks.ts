import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { domainPackSchema, type DomainPack } from '../contracts/domainPack.js';
import { readDomainPackOverlay } from './runtimeSettingsStore.js';

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

/**
 * Checked-in pack + user overlay (Phase 6 domain-pack CRUD), mirroring the
 * MCP-overlay pattern in config/loadConnectors.ts. The overlay wins by id
 * when present -- editing a built-in pack (finance/medical/generic) shadows
 * it without ever mutating the checked-in file; a pack with no checked-in
 * file at all lives purely in the overlay. Overlay checked FIRST so a
 * brand-new pack never hits loadDomainPack's "not found on disk" failure.
 */
export function loadDomainPackWithOverlay(
  runtimeConfigDir: string,
  domainsDir: string,
  domainId: string,
): DomainPack {
  const overlayEntry = readDomainPackOverlay(runtimeConfigDir).find((entry) => entry.id === domainId);
  if (overlayEntry !== undefined) return overlayEntry.pack;
  return loadDomainPack(domainsDir, domainId);
}

/** Checked-in pack ids + overlay-only pack ids (new packs with no checked-in file), deduped and sorted. */
export function listDomainPacksWithOverlay(runtimeConfigDir: string, domainsDir: string): string[] {
  const checkedIn = listDomainPacks(domainsDir);
  const overlayIds = readDomainPackOverlay(runtimeConfigDir).map((entry) => entry.id);
  return Array.from(new Set([...checkedIn, ...overlayIds])).sort();
}
