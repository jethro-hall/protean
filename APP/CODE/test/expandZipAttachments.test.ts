import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Attachment } from '../src/contracts/turn.js';
import { expandZipAttachments } from '../src/watcher/expandZipAttachments.js';

function zipAttachment(name: string, files: Record<string, Uint8Array>): Attachment {
  const bytes = zipSync(files);
  return {
    name,
    mimeType: 'application/zip',
    encoding: 'base64',
    textContent: Buffer.from(bytes).toString('base64'),
  };
}

describe('expandZipAttachments', () => {
  it('passes plain utf8 attachments through unchanged', () => {
    const file: Attachment = { name: 'a.txt', mimeType: 'text/plain', encoding: 'utf8', textContent: 'hi' };
    const result = expandZipAttachments([file]);
    expect(result.attachments).toEqual([file]);
    expect(result.warnings).toEqual([]);
  });

  it('expands a zip into one attachment per safe text entry', () => {
    const zip = zipAttachment('bundle.zip', {
      'a.txt': new TextEncoder().encode('alpha'),
      'b.json': new TextEncoder().encode('{"b":1}'),
    });
    const result = expandZipAttachments([zip]);
    expect(result.attachments.map((a) => a.name).sort()).toEqual(['bundle.zip/a.txt', 'bundle.zip/b.json']);
    expect(result.attachments.every((a) => a.encoding === 'utf8')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('warns with a specific, useable message for skipped binary entries -- never a bare "error"', () => {
    const zip = zipAttachment('bundle.zip', {
      'a.txt': new TextEncoder().encode('alpha'),
      'photo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]),
    });
    const result = expandZipAttachments([zip]);
    expect(result.attachments.map((a) => a.name)).toEqual(['bundle.zip/a.txt']);
    expect(result.warnings.some((w) => w.includes('bundle.zip') && w.includes('photo.png'))).toBe(true);
  });

  it('caps the expanded list at MAX_ATTACHMENTS_PER_TURN and warns about what was left out', () => {
    const zip = zipAttachment('bundle.zip', {
      'a.txt': new TextEncoder().encode('1'),
      'b.txt': new TextEncoder().encode('2'),
      'c.txt': new TextEncoder().encode('3'),
      'd.txt': new TextEncoder().encode('4'),
      'e.txt': new TextEncoder().encode('5'),
      'f.txt': new TextEncoder().encode('6'),
    });
    const result = expandZipAttachments([zip]);
    expect(result.attachments.length).toBe(5);
    expect(result.warnings.some((w) => w.includes('more than the 5-file limit'))).toBe(true);
  });

  it('reports a corrupt base64 payload with a specific message instead of throwing', () => {
    const bad: Attachment = {
      name: 'bad.zip',
      mimeType: 'application/zip',
      encoding: 'base64',
      textContent: '***not base64***',
    };
    const result = expandZipAttachments([bad]);
    expect(result.attachments).toEqual([]);
    // Buffer.from with invalid base64 chars degrades gracefully rather than throwing in Node,
    // so this exercises the safeZipInspect "Could not unpack" path instead -- either way, a
    // specific message, not a crash and not a bare "error".
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).not.toBe('error');
  });
});
