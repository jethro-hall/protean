import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileSessionStore, createMemorySessionStore } from '../src/watcher/sessionStore.js';

describe('memory session store', () => {
  it('appends and reads history per session', () => {
    const store = createMemorySessionStore();
    store.append('s1', { role: 'user', content: 'hi' });
    store.append('s1', { role: 'assistant', content: 'hello' });
    store.append('s2', { role: 'user', content: 'other' });
    expect(store.history('s1')).toHaveLength(2);
    expect(store.history('s2')).toHaveLength(1);
    expect(store.sessionIds().sort()).toEqual(['s1', 's2']);
  });
});

describe('file session store (Phase 2 acceptance: survives restarts)', () => {
  it('persists history across store instances (simulated restart)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-sessions-'));
    const first = createFileSessionStore(dir);
    first.append('chat-1', { role: 'user', content: 'what is our GP?' });
    first.append('chat-1', { role: 'assistant', content: 'GP is $50k.' });

    // "restart": brand-new store instance over the same directory
    const second = createFileSessionStore(dir);
    const history = second.history('chat-1');
    expect(history).toEqual([
      { role: 'user', content: 'what is our GP?' },
      { role: 'assistant', content: 'GP is $50k.' },
    ]);
    expect(second.sessionIds()).toEqual(['chat-1']);
  });

  it('keeps appending correctly after a reload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-sessions-'));
    const first = createFileSessionStore(dir);
    first.append('s', { role: 'user', content: 'one' });
    const second = createFileSessionStore(dir);
    second.append('s', { role: 'assistant', content: 'two' });
    expect(second.history('s').map((m) => m.content)).toEqual(['one', 'two']);
    const third = createFileSessionStore(dir);
    expect(third.history('s').map((m) => m.content)).toEqual(['one', 'two']);
  });

  it('sanitises hostile session ids into safe filenames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-sessions-'));
    const store = createFileSessionStore(dir);
    store.append('../escape attempt', { role: 'user', content: 'x' });
    expect(store.history('../escape attempt')).toHaveLength(1);
    for (const id of store.sessionIds()) {
      expect(id).not.toContain('/');
    }
  });
});
