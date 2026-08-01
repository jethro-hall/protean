import { unzipSync } from 'fflate';
import { MAX_ATTACHMENT_BYTES } from '../config/defaults.js';

/**
 * Safe zip unpacking for attachment expansion (Phase 6 zip attach support).
 * Guards mirror the same three concerns any zip-accepting feature needs:
 * upload size (checked by the caller against MAX_ZIP_BYTES before this runs),
 * path traversal (zip-slip), and per-entry size (reuses MAX_ATTACHMENT_BYTES
 * -- an entry too big to be a normal attachment is skipped, not truncated).
 */

export interface SafeZipEntry {
  path: string;
  text: string;
}

export interface SafeZipInspectResult {
  entries: SafeZipEntry[];
  /** Human-readable reasons entries were left out -- never a silent drop. */
  skipped: string[];
}

function normalizeZipPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isSafeZipPath(normalizedPath: string): boolean {
  if (normalizedPath === '' || normalizedPath.startsWith('/') || normalizedPath.includes('\0')) {
    return false;
  }
  const segments = normalizedPath.split('/');
  return segments.every((segment) => segment !== '' && segment !== '..' && segment !== '.');
}

/**
 * Best-effort text decode; binary content decodes to something full of
 * replacement characters, which isTextLike() below catches so it gets
 * skipped rather than sent to the model as garbage.
 */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * Heuristic: reject content that's mostly non-printable / replacement
 * characters -- control characters (excluding tab/LF/CR) and the Unicode
 * replacement character U+FFFD, which TextDecoder emits for invalid bytes.
 */
const NON_TEXT_CHAR = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g;
function isTextLike(text: string): boolean {
  if (text === '') return false;
  const suspicious = text.match(NON_TEXT_CHAR)?.length ?? 0;
  return suspicious / text.length < 0.01;
}

const MAX_ZIP_ENTRIES = 50;

export function safeZipInspect(bytes: Uint8Array): SafeZipInspectResult {
  const entries: SafeZipEntry[] = [];
  const skipped: string[] = [];

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { entries: [], skipped: [`Could not unpack the zip archive: ${message}`] };
  }

  const rawEntries = Object.entries(unzipped);
  if (rawEntries.length > MAX_ZIP_ENTRIES) {
    skipped.push(
      `Zip contains ${rawEntries.length} files, more than the ${MAX_ZIP_ENTRIES}-file limit -- only the first ${MAX_ZIP_ENTRIES} were inspected.`,
    );
  }

  for (const [rawPath, content] of rawEntries.slice(0, MAX_ZIP_ENTRIES)) {
    const path = normalizeZipPath(rawPath);
    if (path.endsWith('/') || content.byteLength === 0) continue; // directory entry
    if (!isSafeZipPath(path)) {
      skipped.push(`"${rawPath}" -- unsafe path (rejected, not extracted).`);
      continue;
    }
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      skipped.push(
        `"${path}" is ${(content.byteLength / 1024).toFixed(0)} KB -- over the ${MAX_ATTACHMENT_BYTES / 1024} KB per-file limit.`,
      );
      continue;
    }
    const text = decodeText(content);
    if (!isTextLike(text)) {
      skipped.push(`"${path}" looks like a binary file -- skipped (only text files are read into the turn).`);
      continue;
    }
    entries.push({ path, text });
  }

  return { entries, skipped };
}
