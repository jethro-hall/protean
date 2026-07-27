import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** APP/CODE directory, resolved from this file's location (never from cwd). */
export function codeDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Repo root (contains .env, APP/, docs/). */
export function repoRoot(): string {
  return resolve(codeDir(), '..', '..');
}

/** Minimal deterministic .env parser — KEY=VALUE lines, # comments, no expansion. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load repo-root .env into process.env (existing process.env always wins). */
export function loadDotEnv(): void {
  const envPath = join(repoRoot(), '.env');
  if (!existsSync(envPath)) return;
  const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== '') process.env[key] = value;
  }
}
