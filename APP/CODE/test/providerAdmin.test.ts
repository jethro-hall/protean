import { afterEach, describe, expect, it, vi } from 'vitest';
import { testAnthropicConnection, listAnthropicModels } from '../src/gateway/providerAdmin/anthropicAdmin.js';
import { testBedrockConnection, listBedrockModels } from '../src/gateway/providerAdmin/bedrockAdmin.js';
import {
  testOpenAiCompatibleConnection,
  listOpenAiCompatibleModels,
} from '../src/gateway/providerAdmin/openAiCompatibleAdmin.js';
import { testProviderConnection, listProviderModels } from '../src/gateway/providerAdmin/dispatch.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('anthropicAdmin', () => {
  it('lists models and includes the request in the log (no secret leaked)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listAnthropicModels({ type: 'anthropic', apiKey: 'sk-secret' });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['claude-opus-5', 'claude-sonnet-5']);
    expect(result.log.some((line) => line.includes('api.anthropic.com'))).toBe(true);
    expect(result.log.join('\n')).not.toContain('sk-secret');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-secret');
  });

  it('returns a specific message on 401, not a bare "error"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid x-api-key', { status: 401, statusText: 'Unauthorized' })));
    const result = await testAnthropicConnection({ type: 'anthropic', apiKey: 'sk-bad' });
    expect(result.ok).toBe(false);
    expect(result.message).not.toBe('error');
    expect(result.message).toContain('401');
    expect(result.message).toContain('api.anthropic.com');
  });

  it('reports a timeout with a specific message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );
    const pending = listAnthropicModels({ type: 'anthropic', apiKey: 'sk-x' });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    vi.useRealTimers();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Timed out');
  });
});

describe('bedrockAdmin', () => {
  it('lists models via the bearer-token REST endpoint for the given region', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { modelSummaries: [{ modelId: 'anthropic.claude-v2' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listBedrockModels({ type: 'bedrock', awsRegion: 'us-west-2', bearerToken: 'tok-secret' });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['anthropic.claude-v2']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('bedrock.us-west-2.amazonaws.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-secret');
    expect(result.log.join('\n')).not.toContain('tok-secret');
  });

  it('flags an empty model list as a failure with a specific reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { modelSummaries: [] })));
    const result = await testBedrockConnection({ type: 'bedrock', awsRegion: 'us-east-1', bearerToken: 'tok' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('empty model list');
  });
});

describe('openAiCompatibleAdmin', () => {
  it('lists models against the given base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: 'llama-3-70b' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listOpenAiCompatibleModels({
      type: 'openai-compatible',
      baseUrl: 'https://vllm.example.com/v1',
      apiKey: 'key-secret',
    });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['llama-3-70b']);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://vllm.example.com/v1/models');
  });

  it('reports a network error with a specific, useable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await testOpenAiCompatibleConnection({
      type: 'openai-compatible',
      baseUrl: 'https://down.example.com',
      apiKey: 'key',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('ECONNREFUSED');
    expect(result.message).toContain('down.example.com');
  });
});

describe('provider admin dispatch', () => {
  it('routes to the right adapter by provider type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { data: [{ id: 'model-a' }] })));
    const result = await testProviderConnection({ type: 'anthropic', apiKey: 'sk-1' });
    expect(result.ok).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { modelSummaries: [{ modelId: 'model-b' }] })));
    const bedrockResult = await listProviderModels({ type: 'bedrock', awsRegion: 'us-east-1', bearerToken: 't' });
    expect(bedrockResult.models).toEqual(['model-b']);
  });
});
