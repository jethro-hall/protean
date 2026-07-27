import { createHash } from 'node:crypto';
import type { AssembledTurn, TokenUsage } from '../contracts/turn.js';

/**
 * Watcher step 3 — CACHE-CHECK (pure code). Deterministic key over
 * {normalised messages, system prompt, model, domain, toolset version}
 * (ARCHITECTURE §5). Exact hit short-circuits the model entirely — the
 * < 300 ms acceptance path.
 */
export interface CachedTurn {
  output: string;
  model: string;
  usage: TokenUsage | null;
  costUsd: number | null;
  storedAt: string;
}

export interface CacheStore {
  get(key: string): CachedTurn | undefined;
  set(key: string, value: CachedTurn): void;
  size(): number;
}

/** Whitespace-normalise text so trivially-reworded identical prompts still hit. */
export function normaliseForKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function computeCacheKey(turn: AssembledTurn): string {
  const material = JSON.stringify({
    messages: turn.messages.map((message) => ({
      role: message.role,
      content: normaliseForKey(message.content),
    })),
    systemPrompt: normaliseForKey(turn.systemPrompt),
    model: turn.model,
    domainId: turn.domainId,
    toolsetVersion: turn.toolsetVersion,
  });
  return createHash('sha256').update(material).digest('hex');
}

/** In-memory LRU+TTL store (POC). Redis sits behind this same seam later (Law 7). */
export function createMemoryCacheStore(ttlSeconds: number, maxEntries: number): CacheStore {
  const entries = new Map<string, { value: CachedTurn; expiresAtMs: number }>();

  const evictIfOverCap = (): void => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) return;
      entries.delete(oldestKey);
    }
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (Date.now() > entry.expiresAtMs) {
        entries.delete(key);
        return undefined;
      }
      // refresh recency (Map preserves insertion order)
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAtMs: Date.now() + ttlSeconds * 1000 });
      evictIfOverCap();
    },
    size: () => entries.size,
  };
}
