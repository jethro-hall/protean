import { describe, expect, it } from 'vitest';
import type { AssembledTurn } from '../src/contracts/turn.js';
import {
  computeCacheKey,
  createMemoryCacheStore,
  normaliseForKey,
  type CachedTurn,
} from '../src/watcher/cache.js';

function turn(overrides: Partial<AssembledTurn> = {}): AssembledTurn {
  return {
    turnId: 'turn-1',
    sessionId: 'session-1',
    domainId: 'generic',
    input: 'hello',
    systemPrompt: 'be helpful',
    systemPromptStatic: 'be helpful',
    systemPromptDynamic: '',
    messages: [{ role: 'user', content: 'hello' }],
    tier: 'fast',
    model: 'model-a',
    toolsetVersion: 'v0',
    toolPolicy: {
      availableTools: [],
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'dontAsk',
    },
    workspaceDir: '/tmp',
    datasetsDir: '/tmp/datasets',
    domainsDir: '/tmp/domains',
    runtimeConfigDir: '/tmp/runtime-config',
    mcpServers: [],
    wiredTools: [],
    grounded: false,
    knowledgeCollectionsUsed: [],
    knowledgeCollectionWeights: {},
    ...overrides,
  };
}

const cachedValue: CachedTurn = {
  output: 'hi',
  model: 'model-a',
  usage: null,
  costUsd: null,
  storedAt: new Date().toISOString(),
};

describe('normaliseForKey', () => {
  it('collapses whitespace and trims', () => {
    expect(normaliseForKey('  hello\n   world  ')).toBe('hello world');
  });
});

describe('computeCacheKey', () => {
  it('is deterministic for identical turns even with different turn/session ids', () => {
    const a = computeCacheKey(turn({ turnId: 'a', sessionId: 's1' }));
    const b = computeCacheKey(turn({ turnId: 'b', sessionId: 's2' }));
    expect(a).toBe(b);
  });

  it('treats whitespace-only differences as the same prompt', () => {
    const a = computeCacheKey(turn({ messages: [{ role: 'user', content: 'hello   world' }] }));
    const b = computeCacheKey(turn({ messages: [{ role: 'user', content: 'hello world' }] }));
    expect(a).toBe(b);
  });

  it('changes when model, domain, or toolset version change', () => {
    const base = computeCacheKey(turn());
    expect(computeCacheKey(turn({ model: 'model-b' }))).not.toBe(base);
    expect(computeCacheKey(turn({ domainId: 'finance' }))).not.toBe(base);
    expect(computeCacheKey(turn({ toolsetVersion: 'v1' }))).not.toBe(base);
  });

  it('changes when sampling controls change, so a different effort/temperature/maxTokens never serves a stale cached answer', () => {
    const base = computeCacheKey(turn());
    expect(computeCacheKey(turn({ effort: 'high' }))).not.toBe(base);
    expect(computeCacheKey(turn({ temperature: 0.7 }))).not.toBe(base);
    expect(computeCacheKey(turn({ maxTokens: 2048 }))).not.toBe(base);
    expect(computeCacheKey(turn({ temperature: 0.2 }))).not.toBe(computeCacheKey(turn({ temperature: 0.9 })));
  });
});

describe('createMemoryCacheStore', () => {
  it('stores and returns entries within TTL', () => {
    const store = createMemoryCacheStore(60, 10);
    store.set('k', cachedValue);
    expect(store.get('k')?.output).toBe('hi');
  });

  it('expires entries after TTL', async () => {
    const store = createMemoryCacheStore(0, 10); // expires immediately
    store.set('k', cachedValue);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(store.get('k')).toBeUndefined();
  });

  it('evicts the least recently used entry over capacity', () => {
    const store = createMemoryCacheStore(60, 2);
    store.set('a', cachedValue);
    store.set('b', cachedValue);
    store.get('a'); // refresh recency of a
    store.set('c', cachedValue); // evicts b
    expect(store.get('a')).toBeDefined();
    expect(store.get('b')).toBeUndefined();
    expect(store.get('c')).toBeDefined();
    expect(store.size()).toBe(2);
  });
});
