import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { domainPackSchema, type DomainPack } from '../src/contracts/domainPack.js';
import { listDomainPacksWithOverlay, loadDomainPackWithOverlay } from '../src/config/domainPacks.js';
import { loadConfig } from '../src/config/loadConfig.js';
import { saveDomainPackOverlayEntry } from '../src/config/runtimeSettingsStore.js';

function tempRuntimeConfigDir(): string {
  return mkdtempSync(join(tmpdir(), 'protean-domain-pack-overlay-test-'));
}

function testPack(overrides: Partial<DomainPack> = {}): DomainPack {
  return domainPackSchema.parse({
    id: 'generic',
    displayName: 'Test pack',
    version: '0.0.1',
    systemPrompt: 'You are a test assistant.',
    ...overrides,
  });
}

describe('loadDomainPackWithOverlay / listDomainPacksWithOverlay (Phase 6 domain-pack CRUD)', () => {
  it('falls back to the checked-in pack when no overlay entry exists', () => {
    const { domainsDir } = loadConfig().paths;
    const runtimeConfigDir = tempRuntimeConfigDir();
    const pack = loadDomainPackWithOverlay(runtimeConfigDir, domainsDir, 'generic');
    expect(pack.id).toBe('generic');
  });

  it('the overlay shadows a checked-in pack by id without mutating the checked-in file', () => {
    const { domainsDir } = loadConfig().paths;
    const runtimeConfigDir = tempRuntimeConfigDir();
    const checkedIn = loadDomainPackWithOverlay(runtimeConfigDir, domainsDir, 'generic');

    saveDomainPackOverlayEntry(runtimeConfigDir, testPack({ displayName: 'Edited generic pack' }));
    const shadowed = loadDomainPackWithOverlay(runtimeConfigDir, domainsDir, 'generic');
    expect(shadowed.displayName).toBe('Edited generic pack');

    // Checked-in file on disk is untouched -- a fresh read with no overlay still sees the original.
    const untouchedRuntimeConfigDir = tempRuntimeConfigDir();
    const stillOriginal = loadDomainPackWithOverlay(untouchedRuntimeConfigDir, domainsDir, 'generic');
    expect(stillOriginal.displayName).toBe(checkedIn.displayName);
    expect(stillOriginal.displayName).not.toBe('Edited generic pack');
  });

  it('a brand-new pack with no checked-in file lives purely in the overlay', () => {
    const { domainsDir } = loadConfig().paths;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveDomainPackOverlayEntry(runtimeConfigDir, testPack({ id: 'brand-new-pack', displayName: 'Brand New' }));
    const pack = loadDomainPackWithOverlay(runtimeConfigDir, domainsDir, 'brand-new-pack');
    expect(pack.displayName).toBe('Brand New');
  });

  it('fails loud for an id with neither a checked-in file nor an overlay entry (Law 1)', () => {
    const { domainsDir } = loadConfig().paths;
    const runtimeConfigDir = tempRuntimeConfigDir();
    expect(() => loadDomainPackWithOverlay(runtimeConfigDir, domainsDir, 'does-not-exist')).toThrow(/not found/);
  });

  it('listDomainPacksWithOverlay includes both checked-in and overlay-only ids, deduped and sorted', () => {
    const { domainsDir } = loadConfig().paths;
    const runtimeConfigDir = tempRuntimeConfigDir();
    saveDomainPackOverlayEntry(runtimeConfigDir, testPack({ id: 'brand-new-pack' }));
    const ids = listDomainPacksWithOverlay(runtimeConfigDir, domainsDir);
    expect(ids).toContain('generic');
    expect(ids).toContain('brand-new-pack');
    expect(ids).toEqual([...new Set(ids)].sort());
  });
});
