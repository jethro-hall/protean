import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  connectorCatalogSchema,
  type ConnectorCatalog,
} from '../contracts/connectors.js';
import { codeDir } from './env.js';

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
