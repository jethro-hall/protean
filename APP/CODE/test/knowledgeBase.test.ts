import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import {
  listKnowledgeCollections,
  listKnowledgeCollectionsWithOverlay,
  loadKnowledgeCollection,
  loadKnowledgeCollections,
  loadKnowledgeCollectionWithOverlay,
} from '../src/config/knowledgeCollections.js';
import { saveKnowledgeCollectionOverlayEntry } from '../src/config/runtimeSettingsStore.js';
import { knowledgeCollectionSchema, type KnowledgeCollection } from '../src/contracts/knowledge.js';
import { queryKnowledgeBase } from '../src/tools/handlers/knowledgeBase.js';

function tempRuntimeConfigDir(): string {
  return mkdtempSync(join(tmpdir(), 'protean-knowledge-overlay-test-'));
}

function overlayCollection(overrides: Partial<KnowledgeCollection> = {}): KnowledgeCollection {
  return knowledgeCollectionSchema.parse({
    id: 'phase-p-overlay-collection',
    displayName: 'Phase P Overlay Collection',
    chunks: [
      {
        id: 'overlay-chunk-1',
        heading: 'Overlay Heading',
        text: 'Overlay chunk text.',
        sourceTitle: 'Uploaded Doc',
        sourceUrl: 'uploaded.pdf#page=1',
        fetchedAt: '2026-08-02',
      },
    ],
    ...overrides,
  });
}

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

  it('queryKnowledgeBase can see an overlay-only collection (Phase P) when runtimeConfigDir is provided', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveKnowledgeCollectionOverlayEntry(
      runtimeConfigDir,
      overlayCollection({
        chunks: [
          {
            id: 'overlay-chunk-1',
            heading: 'Overlay Heading',
            text: 'A distinctive phrase about zebra migration patterns.',
            sourceTitle: 'Uploaded Doc',
            sourceUrl: 'uploaded.pdf#page=1',
            fetchedAt: '2026-08-02',
          },
        ],
      }),
    );
    const hits = queryKnowledgeBase(
      domainsDir,
      ['phase-p-overlay-collection'],
      'zebra migration',
      5,
      {},
      runtimeConfigDir,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.heading).toBe('Overlay Heading');
  });

  it('queryKnowledgeBase without runtimeConfigDir cannot see an overlay-only collection (fails loud, not silently empty results from a wrong assumption)', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveKnowledgeCollectionOverlayEntry(runtimeConfigDir, overlayCollection());
    expect(() => queryKnowledgeBase(domainsDir, ['phase-p-overlay-collection'], 'anything')).toThrow(/not found/);
  });
});

describe('loadKnowledgeCollectionWithOverlay / listKnowledgeCollectionsWithOverlay (Phase P)', () => {
  it('falls back to the checked-in collection when no overlay entry exists', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const collection = loadKnowledgeCollectionWithOverlay(tempRuntimeConfigDir(), domainsDir, 'finance-ato-rd-tax-incentive');
    expect(collection.id).toBe('finance-ato-rd-tax-incentive');
  });

  it('a brand-new collection with no checked-in file lives purely in the overlay', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveKnowledgeCollectionOverlayEntry(runtimeConfigDir, overlayCollection());
    const collection = loadKnowledgeCollectionWithOverlay(runtimeConfigDir, domainsDir, 'phase-p-overlay-collection');
    expect(collection.displayName).toBe('Phase P Overlay Collection');
  });

  it('listKnowledgeCollectionsWithOverlay includes both checked-in and overlay-only ids, deduped and sorted', () => {
    const domainsDir = loadConfig().paths.domainsDir;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveKnowledgeCollectionOverlayEntry(runtimeConfigDir, overlayCollection());
    const ids = listKnowledgeCollectionsWithOverlay(runtimeConfigDir, domainsDir).map((c) => c.id);
    expect(ids).toContain('finance-ato-rd-tax-incentive');
    expect(ids).toContain('phase-p-overlay-collection');
    expect(ids).toEqual([...new Set(ids)].sort());
  });
});
