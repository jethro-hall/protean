/**
 * Deterministic URL-sourced document extraction — the same "extract, never
 * fabricate" discipline as pdfExtract.ts, applied to a fetched URL instead of
 * an uploaded file. No LLM involved (Law 4): the agent's own WebFetch tool
 * returns an LLM-processed answer to a prompt, not raw page text (confirmed
 * against the installed @anthropic-ai/claude-agent-sdk's WebFetchOutput type
 * — its `result` field is documented as "Processed result from applying the
 * prompt to the content"), which would give this pipeline's fidelity-check
 * step nothing genuine to check the chunks against. So ingestion fetches with
 * plain, deterministic HTTP here, completely separate from any agent turn.
 */
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { MAX_URL_FETCH_BYTES } from '../../config/defaults.js';
import { extractPdfText, type ExtractedPage } from './pdfExtract.js';

export type { ExtractedPage };

export interface UrlExtractResult {
  pages: ExtractedPage[];
  totalChars: number;
  contentType: 'pdf' | 'html' | 'text';
  /** The page's own <title>, when the source was HTML and it had one — for auto-naming, never guessed otherwise. */
  title: string | null;
}

export type UrlExtractOutcome =
  | { ok: true; result: UrlExtractResult }
  | { ok: false; reason: string };

/** Fetch/parse budget — an implementation detail, not a request-boundary limit (MAX_URL_FETCH_BYTES is that). */
export const FETCH_TIMEOUT_MS = 20_000;

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIpv6(ip: string): boolean {
  const normalised = ip.toLowerCase();
  if (normalised === '::1' || normalised === '::') return true;
  if (normalised.startsWith('fe80:')) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalised)) return true; // unique local, fc00::/7
  if (normalised.startsWith('::ffff:')) {
    const mapped = normalised.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

/** True for loopback/private/link-local/reserved addresses — the SSRF guard's actual check. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true; // not a recognisable literal IP -- refuse rather than guess
}

/**
 * SSRF guard for a new surface: a user-supplied URL triggers a server-side
 * fetch. Refuses non-http(s) schemes and any hostname that resolves (or is
 * literally) a loopback/private/link-local/cloud-metadata address.
 * `allowPrivateHosts` exists ONLY for pointing a test at a local fixture
 * server — it is never read from any request body.
 */
export async function isPubliclyRoutableUrl(
  rawUrl: string,
  opts: { allowPrivateHosts?: boolean } = {},
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (opts.allowPrivateHosts === true) return true;

  const hostname = parsed.hostname;
  if (isIP(hostname) !== 0) return !isPrivateAddress(hostname);

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((record) => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

const BLOCK_BREAK_TAGS_RE = /<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>|<br\s*\/?>/gi;

/**
 * Deliberately simple, honest HTML-to-text: strip script/style/comments, turn
 * block-level closes into newlines (preserves paragraph structure for
 * chunkText.ts's heading heuristic), strip remaining tags, decode entities.
 * Not a full "readability" algorithm — a table-heavy legislation page may
 * extract messily, which is exactly what the existing fidelity-check step
 * (tools/authoring/verifyChunkFidelity.ts) exists to catch before a human
 * approves anything, the same safety net pdfExtract.ts's scanned-PDF
 * rejection plays for the PDF path.
 */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(BLOCK_BREAK_TAGS_RE, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Best-effort title for auto-naming a source — `null` when the page has none, never guessed otherwise. */
export function extractHtmlTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match?.[1] === undefined) return null;
  const title = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
  return title === '' ? null : title;
}

function contentTypeFromResponse(url: string, headerValue: string | null): 'pdf' | 'html' | 'text' | null {
  const header = (headerValue ?? '').toLowerCase();
  if (header.includes('application/pdf')) return 'pdf';
  if (header.includes('text/html')) return 'html';
  if (header.includes('text/plain')) return 'text';
  if (header === '') {
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  }
  return null;
}

/** Reads the response body, aborting (returns null) the instant it would exceed the cap — no unbounded fetch. */
async function readBodyWithCap(response: Response, capBytes: number): Promise<Buffer | null> {
  if (response.body === null) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > capBytes ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.length;
    if (total > capBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function extractFromUrl(
  url: string,
  opts: { allowPrivateHosts?: boolean; maxBytes?: number } = {},
): Promise<UrlExtractOutcome> {
  const maxBytes = opts.maxBytes ?? MAX_URL_FETCH_BYTES;
  if (!(await isPubliclyRoutableUrl(url, opts))) {
    return {
      ok: false,
      reason: `"${url}" is not a fetchable public http(s) URL (private/loopback addresses are refused).`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } catch (cause) {
    return { ok: false, reason: `Could not fetch "${url}": ${cause instanceof Error ? cause.message : String(cause)}` };
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    return { ok: false, reason: `Fetching "${url}" returned HTTP ${response.status} ${response.statusText}` };
  }

  // A public URL can redirect to a private one -- re-check the address actually reached.
  if (response.url !== '' && response.url !== url && !(await isPubliclyRoutableUrl(response.url, opts))) {
    return { ok: false, reason: `"${url}" redirected to a non-fetchable address.` };
  }

  const contentType = contentTypeFromResponse(response.url !== '' ? response.url : url, response.headers.get('content-type'));
  if (contentType === null) {
    return { ok: false, reason: `Unsupported content type for "${url}" — only PDF and HTML/plain-text pages are supported.` };
  }

  const body = await readBodyWithCap(response, maxBytes);
  if (body === null) {
    return {
      ok: false,
      reason: `"${url}" exceeds the ${(maxBytes / 1024 / 1024).toFixed(2)} MB fetch limit.`,
    };
  }

  if (contentType === 'pdf') {
    const extracted = await extractPdfText(body);
    if (!extracted.ok) return { ok: false, reason: extracted.reason };
    return { ok: true, result: { ...extracted.result, contentType: 'pdf', title: null } };
  }

  const text = body.toString('utf8');
  if (contentType === 'html') {
    const plain = htmlToText(text);
    if (plain === '') return { ok: false, reason: `No extractable text found at "${url}" after stripping markup.` };
    return {
      ok: true,
      result: {
        pages: [{ pageNumber: 1, text: plain }],
        totalChars: plain.length,
        contentType: 'html',
        title: extractHtmlTitle(text),
      },
    };
  }

  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: `"${url}" returned an empty document.` };
  return {
    ok: true,
    result: { pages: [{ pageNumber: 1, text: trimmed }], totalChars: trimmed.length, contentType: 'text', title: null },
  };
}
