import { describe, expect, it } from 'vitest';
import { listDomainPacks, loadDomainPack } from '../src/config/domainPacks.js';
import { loadConfig, requireModel } from '../src/config/loadConfig.js';
import { parseEnvFile } from '../src/config/env.js';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines, ignoring comments and blanks', () => {
    const parsed = parseEnvFile('# comment\nA=1\n\nB = two \nC="quoted value"\n');
    expect(parsed).toEqual({ A: '1', B: 'two', C: 'quoted value' });
  });
});

describe('domain packs on disk', () => {
  const config = loadConfig();

  it('lists the shipped packs', () => {
    const packs = listDomainPacks(config.paths.domainsDir);
    expect(packs).toContain('generic');
    expect(packs).toContain('finance');
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
