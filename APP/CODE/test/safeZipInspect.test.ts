import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { safeZipInspect } from '../src/watcher/safeZipInspect.js';

describe('safeZipInspect', () => {
  it('extracts safe text entries', () => {
    const zip = zipSync({
      'notes.txt': new TextEncoder().encode('hello world'),
      'data.json': new TextEncoder().encode('{"a":1}'),
    });
    const result = safeZipInspect(zip);
    expect(result.entries.map((e) => e.path).sort()).toEqual(['data.json', 'notes.txt']);
    expect(result.skipped).toEqual([]);
  });

  it('skips binary entries with a specific, useable note (not a bare "error")', () => {
    const zip = zipSync({
      'notes.txt': new TextEncoder().encode('hello'),
      'photo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]),
    });
    const result = safeZipInspect(zip);
    expect(result.entries.map((e) => e.path)).toEqual(['notes.txt']);
    expect(result.skipped.some((s) => s.includes('photo.png') && s.includes('binary'))).toBe(true);
  });

  it('rejects zip-slip paths', () => {
    const zip = zipSync({ '../escape.txt': new TextEncoder().encode('bad') });
    const result = safeZipInspect(zip);
    expect(result.entries).toEqual([]);
    expect(result.skipped.some((s) => s.includes('unsafe path'))).toBe(true);
  });

  it('reports a specific message for a corrupt archive instead of throwing', () => {
    const result = safeZipInspect(new TextEncoder().encode('not a zip file'));
    expect(result.entries).toEqual([]);
    expect(result.skipped[0]).toContain('Could not unpack');
  });

  it('ignores directory entries', () => {
    const zip = zipSync({
      'folder/': new Uint8Array(0),
      'folder/file.txt': new TextEncoder().encode('content'),
    });
    const result = safeZipInspect(zip);
    expect(result.entries.map((e) => e.path)).toEqual(['folder/file.txt']);
  });
});
