import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createArtefactParser,
  partialSuffixLength,
  saveArtefact,
  type ArtefactParserEvent,
} from '../src/watcher/artefacts.js';

const OPEN = '<protean:artefact type="html" title="Test page">';
const CLOSE = '</protean:artefact>';

function collectText(events: ArtefactParserEvent[], kind: 'chat' | 'delta'): string {
  return events
    .filter((event) => event.kind === kind)
    .map((event) => (event as { text: string }).text)
    .join('');
}

describe('partialSuffixLength', () => {
  it('finds held-back tag prefixes', () => {
    expect(partialSuffixLength('hello <prot', '<protean:artefact')).toBe(5);
    expect(partialSuffixLength('hello world', '<protean:artefact')).toBe(0);
    expect(partialSuffixLength('<', '<protean:artefact')).toBe(1);
  });
});

describe('artefact stream parser', () => {
  it('passes plain chat straight through', () => {
    const parser = createArtefactParser();
    const events = [...parser.push('just a normal answer'), ...parser.flush()];
    expect(collectText(events, 'chat')).toBe('just a normal answer');
    expect(events.some((e) => e.kind === 'start')).toBe(false);
  });

  it('splits chat, artefact, and trailing chat in one chunk', () => {
    const parser = createArtefactParser();
    const events = [
      ...parser.push(`Here you go: ${OPEN}<h1>Hi</h1>${CLOSE} Anything else?`),
      ...parser.flush(),
    ];
    expect(collectText(events, 'chat')).toBe('Here you go:  Anything else?');
    expect(collectText(events, 'delta')).toBe('<h1>Hi</h1>');
    const start = events.find((e) => e.kind === 'start');
    if (start?.kind !== 'start') throw new Error('no start');
    expect(start.artefactType).toBe('html');
    expect(start.title).toBe('Test page');
    expect(events.find((e) => e.kind === 'end')).toEqual({ kind: 'end', complete: true });
  });

  it('survives tags split across arbitrary chunk boundaries', () => {
    const full = `Intro ${OPEN}<p>content here</p>${CLOSE} outro`;
    for (const chunkSize of [1, 2, 3, 5, 7, 11]) {
      const parser = createArtefactParser();
      const events: ArtefactParserEvent[] = [];
      for (let i = 0; i < full.length; i += chunkSize) {
        events.push(...parser.push(full.slice(i, i + chunkSize)));
      }
      events.push(...parser.flush());
      expect(collectText(events, 'chat'), `chunkSize=${chunkSize}`).toBe('Intro  outro');
      expect(collectText(events, 'delta'), `chunkSize=${chunkSize}`).toBe('<p>content here</p>');
    }
  });

  it('marks a stream that dies mid-artefact as incomplete — never fakes completion', () => {
    const parser = createArtefactParser();
    const events = [...parser.push(`${OPEN}<h1>partial`), ...parser.flush()];
    expect(events.find((e) => e.kind === 'end')).toEqual({ kind: 'end', complete: false });
    expect(collectText(events, 'delta')).toBe('<h1>partial');
  });

  it('handles multiple artefacts in one turn', () => {
    const parser = createArtefactParser();
    const events = [
      ...parser.push(`${OPEN}one${CLOSE} and ${OPEN}two${CLOSE}`),
      ...parser.flush(),
    ];
    expect(events.filter((e) => e.kind === 'start')).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'end')).toHaveLength(2);
  });

  it('defaults unknown types to text', () => {
    const parser = createArtefactParser();
    const events = parser.push('<protean:artefact type="exe" title="x">y</protean:artefact>');
    const start = events.find((e) => e.kind === 'start');
    if (start?.kind !== 'start') throw new Error('no start');
    expect(start.artefactType).toBe('text');
  });
});

describe('saveArtefact', () => {
  it('writes under a sanitised session dir with the right extension', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protean-artefacts-'));
    const path = saveArtefact(dir, '../sneaky session', 'turn1-a1', 'html', '<h1>x</h1>');
    expect(path.endsWith('turn1-a1.html')).toBe(true);
    expect(path).not.toContain('..');
    expect(readFileSync(path, 'utf8')).toBe('<h1>x</h1>');
  });
});
