import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Turn-segment stream protocol (Phase 3 artefacts + Phase S clarifications). The
 * model is instructed (protocol constants, config/defaults.ts) to wrap artefacts in
 * `<protean:artefact type="..." title="...">…</protean:artefact>` and a genuine
 * blocking clarifying question in `<protean:clarification>…</protean:clarification>`.
 * This parser splits the token stream DETERMINISTICALLY (Law 4) into chat text and
 * these tagged segments, surviving tags split across chunk boundaries. The two tag
 * families share one parser (not two independent ones) because they consume the
 * same underlying stream position — running two parsers over the same buffer would
 * race on which one claims a given span of text.
 */

export const ARTEFACT_OPEN_PREFIX = '<protean:artefact';
export const ARTEFACT_CLOSE_TAG = '</protean:artefact>';

export const CLARIFICATION_OPEN_TAG = '<protean:clarification>';
export const CLARIFICATION_CLOSE_TAG = '</protean:clarification>';

export const ARTEFACT_TYPES = ['html', 'markdown', 'code', 'text'] as const;
export type ArtefactType = (typeof ARTEFACT_TYPES)[number];

const ARTEFACT_FILE_EXTENSIONS: Record<ArtefactType, string> = {
  html: 'html',
  markdown: 'md',
  code: 'txt',
  text: 'txt',
};

export type ArtefactParserEvent =
  | { kind: 'chat'; text: string }
  | { kind: 'start'; artefactType: ArtefactType; title: string }
  | { kind: 'delta'; text: string }
  | { kind: 'end'; complete: boolean }
  | { kind: 'clarification-start' }
  | { kind: 'clarification-delta'; text: string }
  | { kind: 'clarification-end'; complete: boolean };

export interface ArtefactParser {
  push(chunk: string): ArtefactParserEvent[];
  flush(): ArtefactParserEvent[];
}

/** Longest suffix of `text` that is a prefix of `token` (held back until decidable). */
export function partialSuffixLength(text: string, token: string): number {
  const max = Math.min(text.length, token.length - 1);
  for (let len = max; len > 0; len -= 1) {
    if (text.endsWith(token.slice(0, len))) return len;
  }
  return 0;
}

function parseOpenTag(tag: string): { artefactType: ArtefactType; title: string } {
  const typeMatch = /type="([^"]*)"/.exec(tag);
  const titleMatch = /title="([^"]*)"/.exec(tag);
  const rawType = typeMatch?.[1] ?? 'text';
  const artefactType = (ARTEFACT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as ArtefactType)
    : 'text';
  return { artefactType, title: titleMatch?.[1] ?? 'Untitled artefact' };
}

/** Earliest of the two open-tag families in `buffer`, if either is present. */
function findEarliestOpen(buffer: string): { kind: 'artefact' | 'clarification'; at: number } | null {
  const artefactAt = buffer.indexOf(ARTEFACT_OPEN_PREFIX);
  const clarificationAt = buffer.indexOf(CLARIFICATION_OPEN_TAG);
  if (artefactAt === -1 && clarificationAt === -1) return null;
  if (artefactAt === -1) return { kind: 'clarification', at: clarificationAt };
  if (clarificationAt === -1) return { kind: 'artefact', at: artefactAt };
  return artefactAt <= clarificationAt
    ? { kind: 'artefact', at: artefactAt }
    : { kind: 'clarification', at: clarificationAt };
}

type ParserState = 'idle' | 'artefact' | 'clarification';

export function createArtefactParser(): ArtefactParser {
  let buffer = '';
  let state: ParserState = 'idle';

  const drain = (): ArtefactParserEvent[] => {
    const events: ArtefactParserEvent[] = [];
    for (;;) {
      if (state === 'idle') {
        const found = findEarliestOpen(buffer);
        if (found === null) {
          const hold = Math.max(
            partialSuffixLength(buffer, ARTEFACT_OPEN_PREFIX),
            partialSuffixLength(buffer, CLARIFICATION_OPEN_TAG),
          );
          const emit = buffer.slice(0, buffer.length - hold);
          if (emit !== '') events.push({ kind: 'chat', text: emit });
          buffer = buffer.slice(buffer.length - hold);
          return events;
        }
        if (found.kind === 'clarification') {
          const before = buffer.slice(0, found.at);
          if (before !== '') events.push({ kind: 'chat', text: before });
          events.push({ kind: 'clarification-start' });
          buffer = buffer.slice(found.at + CLARIFICATION_OPEN_TAG.length);
          state = 'clarification';
          continue;
        }
        const openAt = found.at;
        const tagEnd = buffer.indexOf('>', openAt);
        if (tagEnd === -1) {
          // open tag not complete yet — emit chat before it, hold the rest
          const emit = buffer.slice(0, openAt);
          if (emit !== '') events.push({ kind: 'chat', text: emit });
          buffer = buffer.slice(openAt);
          return events;
        }
        const before = buffer.slice(0, openAt);
        if (before !== '') events.push({ kind: 'chat', text: before });
        events.push({ kind: 'start', ...parseOpenTag(buffer.slice(openAt, tagEnd + 1)) });
        buffer = buffer.slice(tagEnd + 1);
        state = 'artefact';
      } else if (state === 'artefact') {
        const closeAt = buffer.indexOf(ARTEFACT_CLOSE_TAG);
        if (closeAt === -1) {
          const hold = partialSuffixLength(buffer, ARTEFACT_CLOSE_TAG);
          const emit = buffer.slice(0, buffer.length - hold);
          if (emit !== '') events.push({ kind: 'delta', text: emit });
          buffer = buffer.slice(buffer.length - hold);
          return events;
        }
        const content = buffer.slice(0, closeAt);
        if (content !== '') events.push({ kind: 'delta', text: content });
        events.push({ kind: 'end', complete: true });
        buffer = buffer.slice(closeAt + ARTEFACT_CLOSE_TAG.length);
        state = 'idle';
      } else {
        const closeAt = buffer.indexOf(CLARIFICATION_CLOSE_TAG);
        if (closeAt === -1) {
          const hold = partialSuffixLength(buffer, CLARIFICATION_CLOSE_TAG);
          const emit = buffer.slice(0, buffer.length - hold);
          if (emit !== '') events.push({ kind: 'clarification-delta', text: emit });
          buffer = buffer.slice(buffer.length - hold);
          return events;
        }
        const content = buffer.slice(0, closeAt);
        if (content !== '') events.push({ kind: 'clarification-delta', text: content });
        events.push({ kind: 'clarification-end', complete: true });
        buffer = buffer.slice(closeAt + CLARIFICATION_CLOSE_TAG.length);
        state = 'idle';
      }
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      return drain();
    },
    flush() {
      const events: ArtefactParserEvent[] = [];
      if (buffer !== '') {
        if (state === 'artefact') events.push({ kind: 'delta', text: buffer });
        else if (state === 'clarification') events.push({ kind: 'clarification-delta', text: buffer });
        else events.push({ kind: 'chat', text: buffer });
        buffer = '';
      }
      // stream ended mid-segment — honest incomplete end, never faked as done
      if (state === 'artefact') events.push({ kind: 'end', complete: false });
      else if (state === 'clarification') events.push({ kind: 'clarification-end', complete: false });
      state = 'idle';
      return events;
    },
  };
}

/** Persist a finished artefact under APP/ARTEFACTS/<sessionId>/ and return its path. */
export function saveArtefact(
  artefactsDir: string,
  sessionId: string,
  artefactId: string,
  artefactType: ArtefactType,
  content: string,
): string {
  const safeSession = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'session';
  const dir = join(artefactsDir, safeSession);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${artefactId}.${ARTEFACT_FILE_EXTENSIONS[artefactType]}`);
  writeFileSync(path, content, 'utf8');
  return path;
}
