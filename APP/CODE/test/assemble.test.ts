import { describe, expect, it } from 'vitest';
import type { ToolPolicy } from '../src/contracts/agentLoop.js';
import { domainPackSchema, type DomainPack } from '../src/contracts/domainPack.js';
import type { ChatMessage, TurnRequest } from '../src/contracts/turn.js';
import {
  assembleTurn,
  renderInputWithAttachments,
  renderPackSystemPrompt,
  resolveTier,
  windowHistory,
} from '../src/watcher/assemble.js';

const pack: DomainPack = domainPackSchema.parse({
  id: 'testpack',
  displayName: 'Test pack',
  version: '0.0.1',
  systemPrompt: 'You are a test assistant.',
  vocabulary: { BLUF: 'bottom line up front' },
  tools: ['search', 'fileRead'],
  outputTemplates: { brief: 'answer first → detail' },
  tiers: { default: 'strong', cheapPath: 'fast' },
});

const request: TurnRequest = {
  sessionId: 'session-1',
  domainId: 'testpack',
  input: 'What is 2+2?',
};

const toolPolicy: ToolPolicy = {
  availableTools: ['Read', 'Grep', 'Glob'],
  allowedTools: ['Read', 'Grep', 'Glob'],
  maxTurns: 8,
  permissionMode: 'dontAsk',
};

const assembleBase = {
  request,
  pack,
  model: 'm',
  toolPolicy,
  workspaceDir: '/repo',
  datasetsDir: '/repo/APP/LLMBUILD_DATA/datasets',
  mcpServers: [],
  wiredTools: [
    {
      packToolId: 'search',
      kind: 'builtin' as const,
      description: 'Search workspace',
      sdkTools: ['Grep', 'Glob'],
      mcpToolNames: [],
    },
    {
      packToolId: 'fileRead',
      kind: 'builtin' as const,
      description: 'Read file',
      sdkTools: ['Read'],
      mcpToolNames: [],
    },
  ],
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

describe('renderPackSystemPrompt', () => {
  it('embeds vocabulary, declared tools, and output templates from the pack', () => {
    const rendered = renderPackSystemPrompt(pack);
    expect(rendered.startsWith(pack.systemPrompt)).toBe(true);
    expect(rendered).toContain('Domain vocabulary:');
    expect(rendered).toContain('- BLUF: bottom line up front');
    expect(rendered).toContain('Declared domain tools');
    expect(rendered).toContain('- search');
    expect(rendered).toContain('Output templates:');
    expect(rendered).toContain('- brief: answer first → detail');
  });

  it('omits empty pack sections', () => {
    const bare = domainPackSchema.parse({
      id: 'bare',
      displayName: 'Bare',
      version: '0.0.1',
      systemPrompt: 'Bare persona.',
    });
    expect(renderPackSystemPrompt(bare)).toBe('Bare persona.');
  });
});

describe('assembleTurn', () => {
  it('appends the input as the final user message after windowed history', () => {
    const assembled = assembleTurn({ ...assembleBase, history: historyOf(4) });
    expect(assembled.messages).toHaveLength(5);
    expect(assembled.messages.at(-1)).toEqual({ role: 'user', content: request.input });
    // pack prompt first, then the engine's artefact wire-protocol instruction (Phase 3)
    expect(assembled.systemPrompt.startsWith(pack.systemPrompt)).toBe(true);
    expect(assembled.systemPrompt).toContain('Domain vocabulary:');
    expect(assembled.systemPrompt).toContain('<protean:artefact');
    expect(assembled.tier).toBe('strong');
    expect(assembled.toolsetVersion).toContain('Read');
    expect(assembled.toolPolicy.maxTurns).toBe(8);
    expect(assembled.systemPromptStatic).toBe(renderPackSystemPrompt(pack));
    expect(assembled.systemPromptDynamic).toContain('<protean:artefact');
    expect(assembled.systemPromptDynamic).toContain('Live tool registry wiring');
    expect(assembled.systemPromptDynamic).toContain('search → Grep, Glob');
    expect(assembled.systemPrompt.startsWith(assembled.systemPromptStatic)).toBe(true);
    expect(assembled.wiredTools).toHaveLength(2);
  });

  it('assigns a fresh turnId per assembly', () => {
    const a = assembleTurn({ ...assembleBase, history: [] });
    const b = assembleTurn({ ...assembleBase, history: [] });
    expect(a.turnId).not.toBe(b.turnId);
  });

  it('renders attachments into the final user message as fenced blocks', () => {
    const withFile: TurnRequest = {
      ...request,
      attachments: [{ name: 'spec.json', mimeType: 'application/json', textContent: '{"a":1}' }],
    };
    const assembled = assembleTurn({ ...assembleBase, request: withFile, history: [] });
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
