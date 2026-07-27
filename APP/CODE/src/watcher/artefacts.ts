import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Artefact stream protocol (Phase 3). The model is instructed (protocol
 * constant, config/defaults.ts) to wrap artefacts in
 * `<protean:artefact type="..." title="...">…</protean:artefact>`.
 * This parser splits the token stream DETERMINISTICALLY (Law 4) into chat text
 * and artefact content, surviving tags split across chunk boundaries.
 */

export const ARTEFACT_OPEN_PREFIX = '<protean:artefact';
export const ARTEFACT_CLOSE_TAG = '</protean:artefact>';

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
  | { kind: 'end'; complete: boolean };

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

export function createArtefactParser(): ArtefactParser {
  let buffer = '';
  let insideArtefact = false;

  const drain = (): ArtefactParserEvent[] => {
    const events: ArtefactParserEvent[] = [];
    for (;;) {
      if (!insideArtefact) {
        const openAt = buffer.indexOf(ARTEFACT_OPEN_PREFIX);
        if (openAt === -1) {
          const hold = partialSuffixLength(buffer, ARTEFACT_OPEN_PREFIX);
          const emit = buffer.slice(0, buffer.length - hold);
          if (emit !== '') events.push({ kind: 'chat', text: emit });
          buffer = buffer.slice(buffer.length - hold);
          return events;
        }
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
        insideArtefact = true;
      } else {
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
        insideArtefact = false;
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
        events.push(insideArtefact ? { kind: 'delta', text: buffer } : { kind: 'chat', text: buffer });
        buffer = '';
      }
      if (insideArtefact) {
        // stream ended mid-artefact — honest incomplete end, never faked as done
        events.push({ kind: 'end', complete: false });
        insideArtefact = false;
      }
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
