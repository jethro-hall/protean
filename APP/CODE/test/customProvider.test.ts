import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomProviderGateway } from '../src/gateway/adapters/customProvider.js';
import { createRawGatewayAgentCore } from '../src/agent/adapters/rawGatewayAgent.js';
import type { GatewayRequest } from '../src/contracts/gateway.js';
import type { AssembledTurn } from '../src/contracts/turn.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseRequest: GatewayRequest = {
  turnId: 't1',
  model: 'test-model',
  systemPrompt: 'You are helpful.',
  messages: [{ role: 'user', content: 'hi' }],
};

async function collect(gen: AsyncIterable<{ type: string }>) {
  const events = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('createCustomProviderGateway (anthropic)', () => {
  it('yields text then done on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { content: [{ type: 'text', text: 'hello there' }], usage: { input_tokens: 5, output_tokens: 3 } }),
      ),
    );
    const gateway = createCustomProviderGateway({ type: 'anthropic', apiKey: 'sk-x' });
    const events = await collect(gateway.streamTurn(baseRequest));
    expect(events).toEqual([
      { type: 'text', text: 'hello there' },
      {
        type: 'done',
        model: 'test-model',
        usage: { inputTokens: 5, outputTokens: 3, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: null,
        providerDurationMs: expect.any(Number),
      },
    ]);
  });

  it('yields a specific error event on HTTP failure, not a bare "error"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'invalid x-api-key' } })),
    );
    const gateway = createCustomProviderGateway({ type: 'anthropic', apiKey: 'sk-bad' });
    const events = await collect(gateway.streamTurn(baseRequest));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    expect((events[0] as unknown as { message: string }).message).toContain('invalid x-api-key');
  });
});

describe('createCustomProviderGateway (bedrock)', () => {
  it('calls the bedrock-runtime invoke endpoint for the given region and model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { content: [{ type: 'text', text: 'from bedrock' }], usage: { input_tokens: 1, output_tokens: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const gateway = createCustomProviderGateway({ type: 'bedrock', awsRegion: 'us-west-2', bearerToken: 'tok' });
    const events = await collect(gateway.streamTurn({ ...baseRequest, model: 'anthropic.claude-3-5-sonnet' }));
    expect(events[0]).toEqual({ type: 'text', text: 'from bedrock' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bedrock-runtime.us-west-2.amazonaws.com/model/anthropic.claude-3-5-sonnet/invoke');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});

describe('createCustomProviderGateway (openai-compatible)', () => {
  it('calls {baseUrl}/chat/completions and extracts the message content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: 'from vllm' } }], usage: { prompt_tokens: 2, completion_tokens: 4 } })),
    );
    const gateway = createCustomProviderGateway({ type: 'openai-compatible', baseUrl: 'https://vllm.example.com/v1', apiKey: 'key' });
    const events = await collect(gateway.streamTurn(baseRequest));
    expect(events[0]).toEqual({ type: 'text', text: 'from vllm' });
    const done = events[1] as unknown as { usage: { inputTokens: number; outputTokens: number } };
    expect(done.usage).toEqual({ inputTokens: 2, outputTokens: 4, cacheReadTokens: 0, cacheCreationTokens: 0 });
  });

  it('reports a network error as a specific error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const gateway = createCustomProviderGateway({ type: 'openai-compatible', baseUrl: 'https://down.example.com', apiKey: 'k' });
    const events = await collect(gateway.streamTurn(baseRequest));
    expect(events).toEqual([{ type: 'error', message: 'ECONNREFUSED' }]);
  });
});

describe('createRawGatewayAgentCore', () => {
  it('passes AssembledTurn through to the gateway unchanged, no tool loop', async () => {
    const seen: GatewayRequest[] = [];
    const fakeGateway = {
      provider: 'fake',
      async *streamTurn(request: GatewayRequest) {
        seen.push(request);
        yield { type: 'text' as const, text: 'ok' };
        yield {
          type: 'done' as const,
          model: request.model,
          usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
          costUsd: null,
          providerDurationMs: 1,
        };
      },
    };
    const agent = createRawGatewayAgentCore(fakeGateway);
    const turn = {
      turnId: 'abc',
      model: 'my-model',
      systemPromptStatic: 'static part',
      systemPromptDynamic: 'dynamic part',
      messages: [{ role: 'user' as const, content: 'hi' }],
    } as unknown as AssembledTurn;
    const events = await collect(agent.runTurn(turn));
    expect(events).toHaveLength(2);
    expect(seen[0]?.model).toBe('my-model');
    expect(seen[0]?.systemPrompt).toEqual({ staticPrefix: 'static part', dynamicSuffix: 'dynamic part' });
    expect(agent.name).toBe('raw-fake');
  });
});
