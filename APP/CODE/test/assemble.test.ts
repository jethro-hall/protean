import { describe, expect, it } from 'vitest';
import type { ToolPolicy } from '../src/contracts/agentLoop.js';
import { domainPackSchema, type DomainPack } from '../src/contracts/domainPack.js';
import type { ChatMessage, TurnRequest } from '../src/contracts/turn.js';
import {
  assembleTurn,
  renderInputWithAttachments,
  renderPackSystemPrompt,
  resolveEffectiveTier,
  resolveGrounding,
  resolveResponseDepthInstruction,
  resolveTier,
  resolveTurnTokenBudget,
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
  tier: 'strong' as const,
  toolPolicy,
  workspaceDir: '/repo',
  datasetsDir: '/repo/APP/LLMBUILD_DATA/datasets',
  domainsDir: '/repo/APP/CODE/src/domains',
  grounded: false,
  knowledgeCollectionsUsed: [],
  knowledgeDigest: '',
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
  it('is untouched by responseDepth — depth never silently changes which model answers', () => {
    expect(resolveTier({ ...request, responseDepth: 'professor' }, pack)).toBe('strong');
    expect(resolveTier({ ...request, responseDepth: 'hscLevel', tier: 'strong' }, pack)).toBe('strong');
  });
});

describe('resolveEffectiveTier (deterministic auto-tier gate)', () => {
  const fastPack: DomainPack = domainPackSchema.parse({
    ...pack,
    id: 'fastpack',
    tiers: { default: 'fast', cheapPath: 'fast' },
  });
  const shortRequest: TurnRequest = { ...request, domainId: 'fastpack', input: 'hi' };
  const longRequest: TurnRequest = {
    ...request,
    domainId: 'fastpack',
    input: 'x'.repeat(4 * 3000), // ~3000 estimated tokens
  };

  it('never escalates when auto-tier is disabled', () => {
    const result = resolveEffectiveTier(longRequest, fastPack, {
      autoTierEnabled: false,
      autoTierEscalationTokens: 2000,
    });
    expect(result).toEqual({
      tier: 'fast',
      escalated: false,
      reason: 'pack default tier — auto-tier off or already strong',
    });
  });

  it('never escalates over an explicit tier choice, even above threshold', () => {
    const result = resolveEffectiveTier({ ...longRequest, tier: 'fast' }, fastPack, {
      autoTierEnabled: true,
      autoTierEscalationTokens: 2000,
    });
    expect(result.tier).toBe('fast');
    expect(result.escalated).toBe(false);
    expect(result.reason).toContain('explicit tier requested');
  });

  it('escalates fast→strong when enabled and input exceeds the threshold', () => {
    const result = resolveEffectiveTier(longRequest, fastPack, {
      autoTierEnabled: true,
      autoTierEscalationTokens: 2000,
    });
    expect(result.tier).toBe('strong');
    expect(result.escalated).toBe(true);
    expect(result.reason).toContain('auto-tier threshold');
  });

  it('stays on the deterministic path when enabled but input is within the threshold', () => {
    const result = resolveEffectiveTier(shortRequest, fastPack, {
      autoTierEnabled: true,
      autoTierEscalationTokens: 2000,
    });
    expect(result.tier).toBe('fast');
    expect(result.escalated).toBe(false);
    expect(result.reason).toContain('deterministic path');
  });

  it('is a no-op when the pack default is already strong', () => {
    const result = resolveEffectiveTier(request, pack, {
      autoTierEnabled: true,
      autoTierEscalationTokens: 2000,
    });
    expect(result).toEqual({
      tier: 'strong',
      escalated: false,
      reason: 'pack default tier — auto-tier off or already strong',
    });
  });
});

describe('resolveTurnTokenBudget (friendly depth presets + advanced override)', () => {
  it('falls back to the platform default when neither is set', () => {
    expect(resolveTurnTokenBudget(request, 8000)).toBe(8000);
  });

  it('uses the preset budget when responseDepth is set', () => {
    expect(resolveTurnTokenBudget({ ...request, responseDepth: 'hscLevel' }, 8000)).toBe(3000);
    expect(resolveTurnTokenBudget({ ...request, responseDepth: 'professor' }, 8000)).toBe(16000);
  });

  it('an explicit turnTokenBudget always wins over the preset', () => {
    expect(
      resolveTurnTokenBudget({ ...request, responseDepth: 'hscLevel', turnTokenBudget: 12000 }, 8000),
    ).toBe(12000);
  });
});

describe('resolveResponseDepthInstruction', () => {
  it('is empty (standard) when no depth is requested', () => {
    expect(resolveResponseDepthInstruction(request)).toBe('');
  });

  it('returns the matching preset instruction text', () => {
    expect(resolveResponseDepthInstruction({ ...request, responseDepth: 'professor' })).toContain(
      'expert/postgraduate',
    );
  });
});

describe('resolveGrounding (deterministic grounded-knowledge gate)', () => {
  const groundedPack: DomainPack = domainPackSchema.parse({
    ...pack,
    knowledgeCollections: ['finance-ato-rd-tax-incentive'],
  });

  it('is off when the pack declares no knowledge collections, even if requested', () => {
    const result = resolveGrounding({ ...request, grounded: true }, pack);
    expect(result).toEqual({ grounded: false, collectionIds: [] });
  });

  it('is off by default even when the pack has collections (unticked = standard)', () => {
    const result = resolveGrounding(request, groundedPack);
    expect(result).toEqual({ grounded: false, collectionIds: [] });
  });

  it('is off when explicitly false', () => {
    const result = resolveGrounding({ ...request, grounded: false }, groundedPack);
    expect(result.grounded).toBe(false);
  });

  it('turns on only when both requested AND the pack declares collections', () => {
    const result = resolveGrounding({ ...request, grounded: true }, groundedPack);
    expect(result).toEqual({ grounded: true, collectionIds: ['finance-ato-rd-tax-incentive'] });
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
    expect(assembled.systemPromptDynamic).toContain('official knowledge base');
    expect(assembled.systemPrompt.startsWith(assembled.systemPromptStatic)).toBe(true);
    expect(assembled.wiredTools).toHaveLength(2);
  });

  it('injects a non-empty knowledge digest into the dynamic suffix, not the cacheable prefix', () => {
    const assembled = assembleTurn({
      ...assembleBase,
      history: [],
      grounded: true,
      knowledgeCollectionsUsed: ['finance-ato-rd-tax-incentive'],
      knowledgeDigest: 'Grounded-knowledge digest: some digest text.',
    });
    expect(assembled.systemPromptDynamic).toContain('some digest text');
    expect(assembled.systemPromptStatic).not.toContain('some digest text');
    expect(assembled.grounded).toBe(true);
    expect(assembled.knowledgeCollectionsUsed).toEqual(['finance-ato-rd-tax-incentive']);
  });

  it('injects the response-depth instruction into the dynamic suffix when requested', () => {
    const assembled = assembleTurn({
      ...assembleBase,
      history: [],
      request: { ...request, responseDepth: 'hscLevel' },
    });
    expect(assembled.systemPromptDynamic).toContain('HSC');
  });

  it('omits the depth instruction entirely on the standard path', () => {
    const assembled = assembleTurn({ ...assembleBase, history: [] });
    expect(assembled.systemPromptDynamic).not.toContain('postgraduate');
    expect(assembled.systemPromptDynamic).not.toContain('HSC');
  });

  it('omits any digest section when knowledgeDigest is empty (standard/unticked path)', () => {
    const assembled = assembleTurn({ ...assembleBase, history: [] });
    expect(assembled.grounded).toBe(false);
    expect(assembled.knowledgeCollectionsUsed).toEqual([]);
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
