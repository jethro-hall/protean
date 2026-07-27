import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage } from '../contracts/turn.js';

/**
 * Session/history store seam (ARCHITECTURE §3: the Watcher owns turn history).
 * Phase 0 ships the in-memory implementation; the persistent store (survives
 * restarts) is the Phase 2 deliverable behind this same interface (Law 7).
 */
export interface SessionStore {
  history(sessionId: string): ChatMessage[];
  append(sessionId: string, message: ChatMessage): void;
  sessionIds(): string[];
}

export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, ChatMessage[]>();
  return {
    history: (sessionId) => sessions.get(sessionId) ?? [],
    append: (sessionId, message) => {
      const list = sessions.get(sessionId) ?? [];
      list.push(message);
      sessions.set(sessionId, list);
    },
    sessionIds: () => [...sessions.keys()],
  };
}

const SESSION_FILE_SUFFIX = '.jsonl';

/** Session IDs come from crypto.randomUUID or spike prefixes — keep filenames safe regardless. */
function sessionFileName(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'session';
  return safe + SESSION_FILE_SUFFIX;
}

interface SessionRow {
  ts: string;
  role: ChatMessage['role'];
  content: string;
}

function readSessionFile(path: string): ChatMessage[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const row = JSON.parse(line) as SessionRow;
      return { role: row.role, content: row.content };
    });
}

/**
 * Phase 2 persistent store: one append-only JSONL per session. History survives
 * restarts (the Phase 2 acceptance) with an in-memory read-through cache so the
 * deterministic path stays fast after first load.
 */
export function createFileSessionStore(sessionsDir: string): SessionStore {
  mkdirSync(sessionsDir, { recursive: true });
  const cache = new Map<string, ChatMessage[]>();

  const load = (sessionId: string): ChatMessage[] => {
    const cached = cache.get(sessionId);
    if (cached !== undefined) return cached;
    const messages = readSessionFile(join(sessionsDir, sessionFileName(sessionId)));
    cache.set(sessionId, messages);
    return messages;
  };

  return {
    history: (sessionId) => load(sessionId),
    append: (sessionId, message) => {
      // hydrate the cache from disk BEFORE writing, or the new row would be read back AND pushed
      const history = load(sessionId);
      const row: SessionRow = { ts: new Date().toISOString(), role: message.role, content: message.content };
      appendFileSync(join(sessionsDir, sessionFileName(sessionId)), JSON.stringify(row) + '\n', 'utf8');
      history.push(message);
    },
    sessionIds: () =>
      readdirSync(sessionsDir)
        .filter((name) => name.endsWith(SESSION_FILE_SUFFIX))
        .map((name) => name.slice(0, -SESSION_FILE_SUFFIX.length))
        .sort(),
  };
}
