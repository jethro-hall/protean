import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Attachment } from '../contracts/turn.js';

/**
 * Persist uploaded files under LLMBUILD_DATA/uploads/<sessionId>/ so every
 * turn's inputs are on disk with the rest of the lineage (Law 6). Hostile
 * names are sanitised the same way session/artefact IDs are.
 */
function safeName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'file';
}

export function saveUpload(
  uploadsDir: string,
  sessionId: string,
  turnPrefix: string,
  file: Attachment,
): string {
  const dir = join(uploadsDir, safeName(sessionId));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${turnPrefix}-${safeName(file.name)}`);
  writeFileSync(path, file.textContent, 'utf8');
  return path;
}
