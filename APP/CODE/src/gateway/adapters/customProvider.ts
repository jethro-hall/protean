import type { GatewayEvent, GatewayRequest } from '../../contracts/gateway.js';
import type { LlmGateway } from '../LlmGateway.js';
import type { ProviderAdminConfig } from '../providerAdmin/types.js';

/**
 * Custom provider gateway (Phase 6 Providers & Models -- quick model picker).
 * Non-streaming: one HTTP call, one 'text' event with the full response, then
 * 'done'. An honest simplification, not a fake control -- the built-in
 * Fast/Strong tiers (gateway/adapters/claude.ts) still stream normally; this
 * path trades true token streaming for supporting arbitrary vendor HTTP APIs
 * without a vendor SDK per provider (Law 5: no vendor types outside adapters).
 *
 * No tool use / MCP here (see agent/adapters/rawGatewayAgent.ts) -- the Claude
 * Agent SDK's tool loop is Claude-specific.
 */

function systemText(systemPrompt: GatewayRequest['systemPrompt']): string {
  if (typeof systemPrompt === 'string') return systemPrompt;
  return [systemPrompt.staticPrefix, systemPrompt.dynamicSuffix].filter((s) => s !== '').join('\n\n');
}

async function callAnthropic(
  request: GatewayRequest,
  config: Extract<ProviderAdminConfig, { type: 'anthropic' }>,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      system: systemText(request.systemPrompt),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    ...(request.abortSignal !== undefined ? { signal: request.abortSignal } : {}),
  });
  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
}

async function callBedrock(
  request: GatewayRequest,
  config: Extract<ProviderAdminConfig, { type: 'bedrock' }>,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // Anthropic-on-Bedrock invoke body shape -- this app's own built-in Bedrock
  // connection is Anthropic-only too (gateway/adapters/claude.ts), so this
  // matches the platform's existing scope rather than attempting to support
  // every Bedrock model family's own request/response shape generically.
  const url = `https://bedrock-runtime.${config.awsRegion}.amazonaws.com/model/${encodeURIComponent(request.model)}/invoke`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.bearerToken}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: systemText(request.systemPrompt),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    ...(request.abortSignal !== undefined ? { signal: request.abortSignal } : {}),
  });
  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(`Bedrock ${res.status}: ${body.message ?? res.statusText}`);
  }
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
}

async function callOpenAiCompatible(
  request: GatewayRequest,
  config: Extract<ProviderAdminConfig, { type: 'openai-compatible' }>,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const base = config.baseUrl.replace(/\/+$/, '');
  const system = systemText(request.systemPrompt);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      max_tokens: 4096,
      messages: [
        ...(system !== '' ? [{ role: 'system', content: system }] : []),
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
    ...(request.abortSignal !== undefined ? { signal: request.abortSignal } : {}),
  });
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`${new URL(base).host} ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  const text = body.choices?.[0]?.message?.content ?? '';
  return { text, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
}

export function createCustomProviderGateway(config: ProviderAdminConfig): LlmGateway {
  return {
    provider: config.type,
    async *streamTurn(request: GatewayRequest): AsyncIterable<GatewayEvent> {
      const startedAt = performance.now();
      try {
        const result =
          config.type === 'anthropic'
            ? await callAnthropic(request, config)
            : config.type === 'bedrock'
              ? await callBedrock(request, config)
              : await callOpenAiCompatible(request, config);
        yield { type: 'text', text: result.text };
        yield {
          type: 'done',
          model: request.model,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
          costUsd: null,
          providerDurationMs: Math.round(performance.now() - startedAt),
        };
      } catch (cause) {
        yield { type: 'error', message: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}
