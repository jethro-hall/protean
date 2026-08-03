import { describe, expect, it } from 'vitest';
import { listDomainPacks, loadDomainPack } from '../src/config/domainPacks.js';
import { loadConfig, requireModel } from '../src/config/loadConfig.js';
import { parseEnvFile } from '../src/config/env.js';
import { resolveEffectiveAgentMaxTurns } from '../src/config/defaults.js';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines, ignoring comments and blanks', () => {
    const parsed = parseEnvFile('# comment\nA=1\n\nB = two \nC="quoted value"\n');
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'quoted value' });
  });
});

describe('resolveEffectiveAgentMaxTurns', () => {
  it('falls back to the configured default when no override is requested', () => {
    expect(resolveEffectiveAgentMaxTurns(undefined, 8, 20)).toBe(8);
  });

  it('lets a smaller per-request override win', () => {
    expect(resolveEffectiveAgentMaxTurns(3, 8, 20)).toBe(3);
  });

  it('clamps a per-request override at the hard ceiling, even above the configured default', () => {
    expect(resolveEffectiveAgentMaxTurns(999, 8, 20)).toBe(20);
  });

  it('clamps the configured default itself if it somehow exceeds the ceiling', () => {
    expect(resolveEffectiveAgentMaxTurns(undefined, 50, 20)).toBe(20);
  });
});

describe('domain packs on disk', () => {
  const config = loadConfig();

  it('lists the shipped packs', () => {
    const packs = listDomainPacks(config.paths.domainsDir);
    expect(packs).toContain('generic');
    expect(packs).toContain('finance');
    expect(packs).toContain('medical');
  });

  it('parses every shipped pack against the schema', () => {
    for (const id of listDomainPacks(config.paths.domainsDir)) {
      const pack = loadDomainPack(config.paths.domainsDir, id);
      expect(pack.id).toBe(id);
      expect(pack.systemPrompt.length).toBeGreaterThan(0);
    }
  });

  it('fails loudly for a missing pack', () => {
    expect(() => loadDomainPack(config.paths.domainsDir, 'no-such-pack')).toThrow(/not found/);
  });
});

describe('requireModel', () => {
  it('throws a named-env-var error when a tier has no model', () => {
    const config = loadConfig();
    const stripped = { ...config, models: {} };
    expect(() => requireModel(stripped, 'strong')).toThrow(/PROTEAN_STRONG_MODEL|ANTHROPIC_MODEL/);
  });
});

describe('agentLoop config', () => {
  it('defaults to Read/Grep/Glob/WebSearch/WebFetch multi-turn dontAsk policy', () => {
    const config = loadConfig();
    expect(config.agentLoop.availableTools).toEqual(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']);
    expect(config.agentLoop.allowedTools).toEqual(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']);
    expect(config.agentLoop.maxTurns).toBe(8);
    expect(config.agentLoop.permissionMode).toBe('dontAsk');
    expect(config.agentLoop.toolsetVersion).toContain('Glob');
  });

  it('refuses Bash until sandbox is proven', () => {
    const previous = process.env.PROTEAN_AGENT_AVAILABLE_TOOLS;
    process.env.PROTEAN_AGENT_AVAILABLE_TOOLS = 'Read,Bash';
    try {
      expect(() => loadConfig()).toThrow(/Bash/);
    } finally {
      if (previous === undefined) delete process.env.PROTEAN_AGENT_AVAILABLE_TOOLS;
      else process.env.PROTEAN_AGENT_AVAILABLE_TOOLS = previous;
    }
  });
});
