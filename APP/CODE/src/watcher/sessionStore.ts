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
