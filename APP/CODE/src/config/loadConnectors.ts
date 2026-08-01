import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  connectorCatalogSchema,
  type ConnectorCatalog,
} from '../contracts/connectors.js';
import { codeDir } from './env.js';
import { readMcpOverlay } from './runtimeSettingsStore.js';

/** Catalog lives next to other named config (Law 2) — not buried in logic. */
export const CONNECTORS_CATALOG_FILENAME = 'connectors.catalog.json';

export function connectorsCatalogPath(): string {
  return join(codeDir(), 'src', 'config', CONNECTORS_CATALOG_FILENAME);
}

/** Load and validate the connector catalog. Invalid catalog fails loud (Law 1). */
export function loadConnectorCatalog(path: string = connectorsCatalogPath()): ConnectorCatalog {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return connectorCatalogSchema.parse(raw);
}

/**
 * Static catalog + user-added stdioMcp overlay (Phase 6 settings UI), merged
 * without mutating the checked-in catalog file. A domain pack must still
 * reference the overlay entry's connectorId in its own `tools` array to
 * actually wire it into a turn -- adding a server here makes it available,
 * not automatically active (Law 1: no silent always-on behaviour).
 */
export function loadConnectorCatalogWithOverlay(
  runtimeConfigDir: string,
  path: string = connectorsCatalogPath(),
): ConnectorCatalog {
  const base = loadConnectorCatalog(path);
  const overlay = readMcpOverlay(runtimeConfigDir);
  if (overlay.length === 0) return base;
  const connectors = { ...base.connectors };
  for (const { connectorId, entry } of overlay) {
    connectors[connectorId] = entry;
  }
  return { ...base, connectors };
}
