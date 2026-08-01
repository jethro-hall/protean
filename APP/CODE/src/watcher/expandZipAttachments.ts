import { MAX_ATTACHMENTS_PER_TURN } from '../config/defaults.js';
import type { Attachment } from '../contracts/turn.js';
import { safeZipInspect } from './safeZipInspect.js';

export interface ExpandAttachmentsResult {
  attachments: Attachment[];
  /** Constructive, specific notes -- never a bare "error" (UX truthful-state law). */
  warnings: string[];
}

/**
 * Turns any `encoding: 'base64'` zip attachment into one plain utf8 Attachment
 * per safe text entry, so everything downstream of this call (saveUpload,
 * prompt assembly) only ever sees ordinary text attachments and needs no
 * changes for zip support. Runs before the existing MAX_ATTACHMENTS_PER_TURN
 * cap is applied to the final list.
 */
export function expandZipAttachments(attachments: Attachment[]): ExpandAttachmentsResult {
  const expanded: Attachment[] = [];
  const warnings: string[] = [];

  for (const file of attachments) {
    if (file.encoding !== 'base64') {
      expanded.push(file);
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(file.textContent, 'base64'));
    } catch {
      warnings.push(`"${file.name}" could not be decoded -- it was not a valid base64 zip payload.`);
      continue;
    }

    const { entries, skipped } = safeZipInspect(bytes);
    for (const note of skipped) {
      warnings.push(`${file.name}: ${note}`);
    }
    for (const entry of entries) {
      expanded.push({
        name: `${file.name}/${entry.path}`,
        mimeType: 'text/plain',
        encoding: 'utf8',
        textContent: entry.text,
      });
    }
    if (entries.length === 0 && skipped.length === 0) {
      warnings.push(`"${file.name}" is an empty zip -- nothing to attach.`);
    }
  }

  if (expanded.length > MAX_ATTACHMENTS_PER_TURN) {
    const dropped = expanded.length - MAX_ATTACHMENTS_PER_TURN;
    warnings.push(
      `${expanded.length} files were attached (including zip contents), more than the ${MAX_ATTACHMENTS_PER_TURN}-file limit -- the last ${dropped} were left out.`,
    );
  }

  return { attachments: expanded.slice(0, MAX_ATTACHMENTS_PER_TURN), warnings };
}
