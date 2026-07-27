import { describe, expect, it } from 'vitest';
import { domainPackSchema, type DomainPack } from '../src/contracts/domainPack.js';
import type { ChatMessage, TurnRequest } from '../src/contracts/turn.js';
import {
  assembleTurn,
  renderInputWithAttachments,
  resolveTier,
  windowHistory,
} from '../src/watcher/assemble.js';

const pack: DomainPack = domainPackSchema.parse({
  id: 'testpack',
  displayName: 'Test pack',
  version: '0.0.1',
  systemPrompt: 'You are a test assistant.',
  tiers: { default: 'strong', cheapPath: 'fast' },
});

const request: TurnRequest = {
  sessionId: 'session-1',
  domainId: 'testpack',
  input: 'What is 2+2?',
};

function historyOf(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message ${index}`,
  }));
}

describe('windowHistory', () => {
  it('keeps the most recent messages when over the window', () => {
    const windowed = windowHistory(historyOf(30), 20);
    expect(windowed).toHaveLength(20);
    expect(windowed.at(-1)?.content).toBe('message 29');
  });

  it('returns history untouched when under the window', () => {
    expect(windowHistory(historyOf(3), 20)).toHaveLength(3);
  });
});

describe('resolveTier', () => {
  it('uses the request tier when pinned', () => {
    expect(resolveTier({ ...request, tier: 'fast' }, pack)).toBe('fast');
  });
  it('falls back to the pack default', () => {
    expect(resolveTier(request, pack)).toBe('strong');
  });
});

describe('assembleTurn', () => {
  it('appends the input as the final user message after windowed history', () => {
    const assembled = assembleTurn({ request, pack, history: historyOf(4), model: 'm' });
    expect(assembled.messages).toHaveLength(5);
    expect(assembled.messages.at(-1)).toEqual({ role: 'user', content: request.input });
    // pack prompt first, then the engine's artefact wire-protocol instruction (Phase 3)
    expect(assembled.systemPrompt.startsWith(pack.systemPrompt)).toBe(true);
    expect(assembled.systemPrompt).toContain('<protean:artefact');
    expect(assembled.tier).toBe('strong');
  });

  it('assigns a fresh turnId per assembly', () => {
    const a = assembleTurn({ request, pack, history: [], model: 'm' });
    const b = assembleTurn({ request, pack, history: [], model: 'm' });
    expect(a.turnId).not.toBe(b.turnId);
  });

  it('renders attachments into the final user message as fenced blocks', () => {
    const withFile: TurnRequest = {
      ...request,
      attachments: [{ name: 'spec.json', mimeType: 'application/json', textContent: '{"a":1}' }],
    };
    const assembled = assembleTurn({ request: withFile, pack, history: [], model: 'm' });
    const last = assembled.messages.at(-1);
    expect(last?.content).toContain(request.input);
    expect(last?.content).toContain('Attached file "spec.json" (application/json)');
    expect(last?.content).toContain('{"a":1}');
    // the raw input field stays the user's words (lineage keeps both)
    expect(assembled.input).toBe(request.input);
  });
});

describe('renderInputWithAttachments', () => {
  it('returns the input unchanged with no attachments', () => {
    expect(renderInputWithAttachments('hi', undefined)).toBe('hi');
    expect(renderInputWithAttachments('hi', [])).toBe('hi');
  });
});
