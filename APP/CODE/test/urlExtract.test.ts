import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractFromUrl,
  extractHtmlTitle,
  htmlToText,
  isPrivateAddress,
  isPubliclyRoutableUrl,
} from '../src/tools/ingestion/urlExtract.js';
import { buildTestPdf } from './helpers/buildTestPdf.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPrivateAddress', () => {
  it('flags loopback, private, and link-local IPv4 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('172.16.0.5')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.1.1')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true); // carrier-grade NAT
  });

  it('allows ordinary public IPv4 addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
  });

  it('flags IPv6 loopback, unique-local, and link-local', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  it('allows an ordinary public IPv6 address', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('refuses anything that is not a recognisable literal IP', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('isPubliclyRoutableUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    expect(await isPubliclyRoutableUrl('ftp://example.com/file.pdf')).toBe(false);
    expect(await isPubliclyRoutableUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects an unparsable URL', async () => {
    expect(await isPubliclyRoutableUrl('not a url')).toBe(false);
  });

  it('rejects a private IPv4 literal host', async () => {
    expect(await isPubliclyRoutableUrl('http://127.0.0.1/x')).toBe(false);
    expect(await isPubliclyRoutableUrl('http://192.168.0.1/x')).toBe(false);
  });

  it('rejects a hostname that resolves to loopback (localhost)', async () => {
    expect(await isPubliclyRoutableUrl('http://localhost/x')).toBe(false);
  });

  it('allows a private host when allowPrivateHosts is set (test-only escape hatch)', async () => {
    expect(await isPubliclyRoutableUrl('http://127.0.0.1/x', { allowPrivateHosts: true })).toBe(true);
  });
});

describe('htmlToText', () => {
  it('strips scripts, styles, and comments entirely', () => {
    const html = '<html><head><style>body{color:red}</style><script>evil()</script></head>' +
      '<body><!-- a comment --><p>Real content.</p></body></html>';
    const text = htmlToText(html);
    expect(text).toBe('Real content.');
  });

  it('turns block-level closes into line breaks and strips remaining tags', () => {
    const html = '<div><p>First paragraph.</p><p>Second paragraph.</p><ul><li>One</li><li>Two</li></ul></div>';
    const text = htmlToText(html);
    expect(text.split('\n')).toEqual(['First paragraph.', 'Second paragraph.', 'One', 'Two']);
  });

  it('decodes named and numeric HTML entities', () => {
    expect(htmlToText('<p>Fish &amp; chips &mdash; caf&#233; &#x2014; done</p>')).toBe('Fish & chips — café — done');
  });
});

describe('extractHtmlTitle', () => {
  it('extracts and decodes the <title> tag', () => {
    expect(extractHtmlTitle('<html><head><title>Acts &amp; Regulations</title></head></html>')).toBe(
      'Acts & Regulations',
    );
  });

  it('returns null when there is no title', () => {
    expect(extractHtmlTitle('<html><body>no title here</body></html>')).toBeNull();
  });
});

describe('extractFromUrl', () => {
  it('refuses a private-host URL before ever calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await extractFromUrl('http://127.0.0.1/doc.pdf');
    expect(outcome.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('extracts a PDF fetched from a URL using the existing PDF extractor unchanged', async () => {
    const pdfBytes = buildTestPdf([
      [
        { text: 'Section 1: Real statute text for the test, with enough words to clear the density check.' },
        { text: 'A second line of genuine body content, also long enough to count as real text.' },
      ],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
      ),
    );
    const outcome = await extractFromUrl('http://127.0.0.1/act.pdf', { allowPrivateHosts: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.contentType).toBe('pdf');
      expect(outcome.result.pages[0]?.text).toContain('Section 1');
    }
  });

  it('extracts HTML fetched from a URL via the deterministic HTML extractor', async () => {
    const html = '<html><head><title>My Act</title></head><body><p>Clause one.</p><p>Clause two.</p></body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );
    const outcome = await extractFromUrl('http://127.0.0.1/act.html', { allowPrivateHosts: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.contentType).toBe('html');
      expect(outcome.result.title).toBe('My Act');
      expect(outcome.result.pages).toEqual([{ pageNumber: 1, text: 'Clause one.\nClause two.' }]);
    }
  });

  it('rejects an unsupported content type rather than guessing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
      ),
    );
    const outcome = await extractFromUrl('http://127.0.0.1/file.bin', { allowPrivateHosts: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('Unsupported content type');
  });

  it('rejects a non-2xx HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404, statusText: 'Not Found' })));
    const outcome = await extractFromUrl('http://127.0.0.1/missing.html', { allowPrivateHosts: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('404');
  });

  it('rejects a response exceeding the byte cap, without buffering the whole thing forever', async () => {
    const body = 'x'.repeat(1000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })));
    const outcome = await extractFromUrl('http://127.0.0.1/big.txt', { allowPrivateHosts: true, maxBytes: 10 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('fetch limit');
  });

  it('surfaces a network failure as a clear reason, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));
    const outcome = await extractFromUrl('http://127.0.0.1/x.html', { allowPrivateHosts: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('Could not fetch');
  });

  it('re-checks the final URL after a redirect, refusing one that lands on a private address', async () => {
    // A literal public-looking IP for the INITIAL url (so the first guard check needs no real
    // DNS lookup -- fully hermetic), redirecting to the classic SSRF target: the cloud metadata
    // endpoint. Duck-typed mock (not a real Response) -- Response.url is not settable via the
    // public constructor, and this branch specifically depends on response.url differing from
    // the requested url after a redirect.
    const redirectedResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'http://169.254.169.254/latest/meta-data/',
      headers: { get: () => 'text/html' },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode('<html><body>should never be read</body></html>').buffer,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectedResponse));
    const outcome = await extractFromUrl('http://8.0.0.1/redirector');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('redirected');
  });
});
