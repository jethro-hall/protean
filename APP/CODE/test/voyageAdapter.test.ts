import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoyageEmbeddingGateway } from '../src/gateway/embeddings/voyageAdapter.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createVoyageEmbeddingGateway', () => {
  it('sends texts/model/input_type and returns embeddings ordered by index, not response order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [
          { embedding: [0.2, 0.3], index: 1 },
          { embedding: [0.1, 0.1], index: 0 },
        ],
        model: 'voyage-4',
        usage: { total_tokens: 12 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createVoyageEmbeddingGateway('key-x', 'voyage-4');
    const result = await gateway.embed({ texts: ['a', 'b'], inputType: 'document' });

    expect(result.embeddings).toEqual([
      [0.1, 0.1],
      [0.2, 0.3],
    ]);
    expect(result.model).toBe('voyage-4');
    expect(result.totalTokens).toBe(12);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-x');
    const sentBody = JSON.parse(init.body as string) as {
      input: string[];
      model: string;
      input_type: string;
    };
    expect(sentBody).toEqual({ input: ['a', 'b'], model: 'voyage-4', input_type: 'document' });
  });

  it('omits input_type from the request body when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ embedding: [1], index: 0 }], model: 'voyage-4', usage: { total_tokens: 1 } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createVoyageEmbeddingGateway('key-x', 'voyage-4');
    await gateway.embed({ texts: ['a'] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('input_type' in sentBody).toBe(false);
  });

  it('yields a specific error on HTTP failure, not a bare "error"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'invalid API key' } })),
    );
    const gateway = createVoyageEmbeddingGateway('bad-key', 'voyage-4');
    await expect(gateway.embed({ texts: ['a'] })).rejects.toThrow(/401.*invalid API key/);
  });

  it('rejects an empty text list before making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createVoyageEmbeddingGateway('key-x', 'voyage-4');
    await expect(gateway.embed({ texts: [] })).rejects.toThrow(/zero texts/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a batch over Voyage\'s 1000-item cap before making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createVoyageEmbeddingGateway('key-x', 'voyage-4');
    const texts = Array.from({ length: 1001 }, (_, i) => `text-${i}`);
    await expect(gateway.embed({ texts })).rejects.toThrow(/caps a single batch at 1000/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a specific error when the response is missing expected fields, rather than returning undefined silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));
    const gateway = createVoyageEmbeddingGateway('key-x', 'voyage-4');
    await expect(gateway.embed({ texts: ['a'] })).rejects.toThrow(/unexpected shape/);
  });
});
