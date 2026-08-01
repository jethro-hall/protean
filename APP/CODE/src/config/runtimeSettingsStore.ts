import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderAdminConfig, ProviderType } from '../gateway/providerAdmin/types.js';

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
  };
}

export function listProviders(runtimeConfigDir: string): ProviderSummary[] {
  return readAll(runtimeConfigDir).map(toSummary);
}

export function getProviderConfig(runtimeConfigDir: string, id: string): ProviderAdminConfig | undefined {
  return readAll(runtimeConfigDir).find((record) => record.id === id)?.config;
}

export function saveProvider(
  runtimeConfigDir: string,
  input: { id?: string | undefined; label: string; config: ProviderAdminConfig },
): ProviderRecord {
  const records = readAll(runtimeConfigDir);
  const existingIndex = input.id !== undefined ? records.findIndex((r) => r.id === input.id) : -1;
  const record: ProviderRecord = {
    id: input.id ?? randomUUID(),
    type: input.config.type,
    label: input.label,
    createdAt: existingIndex >= 0 ? records[existingIndex]!.createdAt : new Date().toISOString(),
    config: input.config,
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
