import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import {
  listKnowledgeCollections,
  loadKnowledgeCollection,
  loadKnowledgeCollections,
} from '../src/config/knowledgeCollections.js';
import { queryKnowledgeBase } from '../src/tools/handlers/knowledgeBase.js';

describe('loadKnowledgeCollection', () => {
  it('loads the shipped finance R&D Tax Incentive collection by id', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const collection = loadKnowledgeCollection(domainsDir, 'finance-ato-rd-tax-incentive');
    expect(collection.displayName).toContain('ATO');
    expect(collection.chunks.length).toBeGreaterThan(0);
    for (const chunk of collection.chunks) {
      expect(chunk.sourceUrl.startsWith('https://www.ato.gov.au')).toBe(true);
    }
  });

  it('loads the shipped medical RACGP collection by id', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const collection = loadKnowledgeCollection(domainsDir, 'medical-racgp-standards');
    expect(collection.displayName).toContain('RACGP');
    expect(collection.chunks.length).toBeGreaterThan(0);
  });

  it('fails loud for an unknown collection id (Law 1 — no silent empty)', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    expect(() => loadKnowledgeCollection(domainsDir, 'does-not-exist')).toThrow(/not found/);
  });
});

describe('listKnowledgeCollections (Phase 6 domain-pack editor)', () => {
  it('lists every checked-in collection id + display name, sorted', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const ids = listKnowledgeCollections(domainsDir).map((c) => c.id);
    expect(ids).toContain('finance-ato-rd-tax-incentive');
    expect(ids).toContain('medical-racgp-standards');
    expect(ids).toEqual([...ids].sort());
  });
});

describe('queryKnowledgeBase', () => {
  it('returns relevant, cited hits for a real query against the finance collection', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const hits = queryKnowledgeBase(
      domainsDir,
      ['finance-ato-rd-tax-incentive'],
      'what is the notional deduction threshold for R&D',
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.sourceUrl).toContain('ato.gov.au');
    expect(hits[0]?.heading.toLowerCase()).toContain('threshold');
  });

  it('returns nothing for a query with no term overlap', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const hits = queryKnowledgeBase(domainsDir, ['finance-ato-rd-tax-incentive'], 'xyzzy plugh qwerty');
    expect(hits).toEqual([]);
  });

  it('loadKnowledgeCollections preserves requested order', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const [finance, medical] = loadKnowledgeCollections(domainsDir, [
      'finance-ato-rd-tax-incentive',
      'medical-racgp-standards',
    ]);
    expect(finance?.id).toBe('finance-ato-rd-tax-incentive');
    expect(medical?.id).toBe('medical-racgp-standards');
  });
});
