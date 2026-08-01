import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ProviderAdminConfig, ProviderType } from '../gateway/providerAdmin/types.js';
import { stdioMcpConnectorSchema } from '../contracts/connectors.js';
import type { DomainPack } from '../contracts/domainPack.js';

/**
 * File-backed store for user-added LLM providers (Phase 6 settings UI) --
 * same convention as watcher/sessionStore.ts and watcher/uploads.ts: plain
 * JSON on disk under LLMBUILD_DATA, no database. Secrets live in this file
 * server-side only, same posture this app already has for .env-held API
 * keys -- not a regression, and consistent with ROADMAP's deferral of
 * auth/tenant isolation at this pre-SaaS stage.
 */

export interface ProviderRecord {
  id: string;
  type: ProviderType;
  label: string;
  createdAt: string;
  config: ProviderAdminConfig;
  /** Which of this provider's models the quick picker (Phase 6) sends turns to. */
  model?: string;
}

export interface ProviderSummary {
  id: string;
  type: ProviderType;
  label: string;
  createdAt: string;
  /** Non-secret context shown in the list (region / base URL); empty for Anthropic. */
  detail: string;
  /** Last 4 chars only -- never the real secret. */
  secretRedacted: string;
  /** Which model the quick picker sends turns to, if set. */
  model?: string;
}

function providersFile(runtimeConfigDir: string): string {
  return join(runtimeConfigDir, 'providers.json');
}

function readAll(runtimeConfigDir: string): ProviderRecord[] {
  const path = providersFile(runtimeConfigDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as ProviderRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(runtimeConfigDir: string, records: ProviderRecord[]): void {
  mkdirSync(runtimeConfigDir, { recursive: true });
  writeFileSync(providersFile(runtimeConfigDir), JSON.stringify(records, null, 2), 'utf8');
}

function secretOf(config: ProviderAdminConfig): string {
  switch (config.type) {
    case 'anthropic':
      return config.apiKey;
    case 'bedrock':
      return config.bearerToken;
    case 'openai-compatible':
      return config.apiKey;
  }
}

function detailOf(config: ProviderAdminConfig): string {
  switch (config.type) {
    case 'anthropic':
      return '';
    case 'bedrock':
      return config.awsRegion;
    case 'openai-compatible':
      return config.baseUrl;
  }
}

function redact(secret: string): string {
  if (secret.length <= 4) return '***';
  return `***${secret.slice(-4)}`;
}

export function toSummary(record: ProviderRecord): ProviderSummary {
  return {
    id: record.id,
    type: record.type,
    label: record.label,
    createdAt: record.createdAt,
    detail: detailOf(record.config),
    secretRedacted: redact(secretOf(record.config)),
    ...(record.model !== undefined ? { model: record.model } : {}),
  };
}

export function listProviders(runtimeConfigDir: string): ProviderSummary[] {
  return readAll(runtimeConfigDir).map(toSummary);
}

export function getProviderConfig(runtimeConfigDir: string, id: string): ProviderAdminConfig | undefined {
  return readAll(runtimeConfigDir).find((record) => record.id === id)?.config;
}

/** Full record (config + selected model) -- used to actually execute a turn against this provider. */
export function getProviderRecord(runtimeConfigDir: string, id: string): ProviderRecord | undefined {
  return readAll(runtimeConfigDir).find((record) => record.id === id);
}

export function saveProvider(
  runtimeConfigDir: string,
  input: { id?: string | undefined; label: string; config: ProviderAdminConfig; model?: string | undefined },
): ProviderRecord {
  const records = readAll(runtimeConfigDir);
  const existingIndex = input.id !== undefined ? records.findIndex((r) => r.id === input.id) : -1;
  const record: ProviderRecord = {
    id: input.id ?? randomUUID(),
    type: input.config.type,
    label: input.label,
    createdAt: existingIndex >= 0 ? records[existingIndex]!.createdAt : new Date().toISOString(),
    config: input.config,
    ...(input.model !== undefined ? { model: input.model } : {}),
  };
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }
  writeAll(runtimeConfigDir, records);
  return record;
}

export function deleteProvider(runtimeConfigDir: string, id: string): boolean {
  const records = readAll(runtimeConfigDir);
  const next = records.filter((record) => record.id !== id);
  if (next.length === records.length) return false;
  writeAll(runtimeConfigDir, next);
  return true;
}

// ---------------------------------------------------------------------------
// MCP overlay: user-added stdioMcp connectors (Phase 6 settings UI). Merged
// with the static, checked-in connectors.catalog.json at load time -- never
// mutates that file. Only stdioMcp is addable this way: builtin/sdkMcp
// connectors require a real code-level handler to exist (hard architecture
// fact, not a scoping choice -- see tools/registry.ts's SDK_MCP_HANDLER_BY_SERVER).
// ---------------------------------------------------------------------------

export type StdioMcpConnector = z.infer<typeof stdioMcpConnectorSchema>;

export interface McpOverlayEntry {
  /** Catalog key -- same namespace a domain pack's `tools` array references. */
  connectorId: string;
  entry: StdioMcpConnector;
  createdAt: string;
}

function mcpOverlayFile(runtimeConfigDir: string): string {
  return join(runtimeConfigDir, 'mcp-overlay.json');
}

export function readMcpOverlay(runtimeConfigDir: string): McpOverlayEntry[] {
  const path = mcpOverlayFile(runtimeConfigDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as McpOverlayEntry[]) : [];
  } catch {
    return [];
  }
}

function writeMcpOverlay(runtimeConfigDir: string, entries: McpOverlayEntry[]): void {
  mkdirSync(runtimeConfigDir, { recursive: true });
  writeFileSync(mcpOverlayFile(runtimeConfigDir), JSON.stringify(entries, null, 2), 'utf8');
}

export function saveMcpOverlayEntry(
  runtimeConfigDir: string,
  connectorId: string,
  entry: StdioMcpConnector,
): McpOverlayEntry {
  const entries = readMcpOverlay(runtimeConfigDir);
  const existingIndex = entries.findIndex((e) => e.connectorId === connectorId);
  const record: McpOverlayEntry = {
    connectorId,
    entry,
    createdAt: existingIndex >= 0 ? entries[existingIndex]!.createdAt : new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = record;
  } else {
    entries.push(record);
  }
  writeMcpOverlay(runtimeConfigDir, entries);
  return record;
}

export function deleteMcpOverlayEntry(runtimeConfigDir: string, connectorId: string): boolean {
  const entries = readMcpOverlay(runtimeConfigDir);
  const next = entries.filter((e) => e.connectorId !== connectorId);
  if (next.length === entries.length) return false;
  writeMcpOverlay(runtimeConfigDir, next);
  return true;
}

// ---------------------------------------------------------------------------
// Domain pack overlay: user-created/edited packs (Phase 6 settings UI).
// Same overlay convention as the MCP section above -- editing a built-in pack
// (finance/medical/generic) shadows it here without ever mutating the
// checked-in domains/<id>/pack.json; deleting the overlay entry is "reset to
// default" for a shadowed built-in, or a real delete for an overlay-only pack.
// ---------------------------------------------------------------------------

export interface DomainPackOverlayEntry {
  id: string;
  pack: DomainPack;
  createdAt: string;
}

function domainPackOverlayFile(runtimeConfigDir: string): string {
  return join(runtimeConfigDir, 'domain-packs.json');
}

export function readDomainPackOverlay(runtimeConfigDir: string): DomainPackOverlayEntry[] {
  const path = domainPackOverlayFile(runtimeConfigDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as DomainPackOverlayEntry[]) : [];
  } catch {
    return [];
  }
}

function writeDomainPackOverlay(runtimeConfigDir: string, entries: DomainPackOverlayEntry[]): void {
  mkdirSync(runtimeConfigDir, { recursive: true });
  writeFileSync(domainPackOverlayFile(runtimeConfigDir), JSON.stringify(entries, null, 2), 'utf8');
}

export function saveDomainPackOverlayEntry(runtimeConfigDir: string, pack: DomainPack): DomainPackOverlayEntry {
  const entries = readDomainPackOverlay(runtimeConfigDir);
  const existingIndex = entries.findIndex((e) => e.id === pack.id);
  const record: DomainPackOverlayEntry = {
    id: pack.id,
    pack,
    createdAt: existingIndex >= 0 ? entries[existingIndex]!.createdAt : new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    entries[existingIndex] = record;
  } else {
    entries.push(record);
  }
  writeDomainPackOverlay(runtimeConfigDir, entries);
  return record;
}

/** Removes the overlay entry only -- "reset to default" when a checked-in pack.json still exists for this id, a real delete otherwise. */
export function deleteDomainPackOverlayEntry(runtimeConfigDir: string, id: string): boolean {
  const entries = readDomainPackOverlay(runtimeConfigDir);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  writeDomainPackOverlay(runtimeConfigDir, next);
  return true;
}
