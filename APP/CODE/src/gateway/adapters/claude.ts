/**
 * Claude adapter for the LlmGateway — the ONLY file that may import the vendor
 * SDK (Law 5). Serves both auth routes behind one adapter: AWS Bedrock
 * (CLAUDE_CODE_USE_BEDROCK=1 + AWS_* env) and the direct Anthropic API
 * (ANTHROPIC_API_KEY) — the SDK subprocess picks the route from env.
 *
 * API surface verified against installed @anthropic-ai/claude-agent-sdk 0.3.220
 * type declarations on 2026-07-27 (sdk.d.ts): query({ prompt, options }),
 * Options.{model,systemPrompt,tools,maxTurns,includePartialMessages,persistSession},
 * SDKPartialAssistantMessage stream_event, SDKResultMessage success/error.
 */
import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { GatewayEvent, GatewayRequest } from '../../contracts/gateway.js';
import type { ChatMessage, TokenUsage } from '../../contracts/turn.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { LlmGateway } from '../LlmGateway.js';

/** One answering turn, no tool loop (Phase 0 baseline; tools arrive with the registry phase). */
const SINGLE_ANSWER_MAX_TURNS = 1;

/**
 * Adaptive thinking: the model decides when/how deeply to reason, and the raw
 * stream carries thinking blocks we surface as REAL activity (never cosmetic).
 * Verified against sdk.d.ts 0.3.220 ThinkingConfig.
 */
const THINKING_CONFIG = { type: 'adaptive' } as const;

const ACTIVITY_LABELS = {
  thinking: 'Thought process',
  tool: (name: string): string => `Using tool: ${name}`,
} as const;

/**
 * The assembled history is rendered into the prompt deterministically (Law 4).
 * The SDK holds no session state for us (persistSession false) — Protean's
 * Watcher/history store owns memory, not the vendor.
 */
export function renderPromptFromMessages(messages: ChatMessage[]): string {
  if (messages.length === 1 && messages[0] !== undefined) return messages[0].content;
  return messages
    .map((message) => (message.role === 'user' ? `User: ${message.content}` : `Assistant: ${message.content}`))
    .join('\n\n');
}

function usageFromResult(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
  };
}

/** Tracks which stream content-block indexes are activities (thinking/tool blocks). */
export interface StreamBlockState {
  activityKindByIndex: Map<number, 'thinking' | 'tool'>;
}

export function createStreamBlockState(): StreamBlockState {
  return { activityKindByIndex: new Map() };
}

/**
 * Map one SDK stream message to gateway events (pure, testable). Text deltas
 * become `text`; thinking/tool blocks become activity events keyed by
 * turnId+block index so the GUI can group their streams.
 */
export function gatewayEventsFromSdkMessage(
  message: SDKMessage,
  turnId: string,
  state: StreamBlockState,
): GatewayEvent[] {
  if (message.type !== 'stream_event') return [];
  const event = message.event;

  if (event.type === 'content_block_start') {
    const block = event.content_block;
    if (block.type === 'thinking') {
      state.activityKindByIndex.set(event.index, 'thinking');
      return [
        {
          type: 'activity-start',
          activityId: `${turnId}-b${event.index}`,
          kind: 'thinking',
          label: ACTIVITY_LABELS.thinking,
        },
      ];
    }
    if (block.type === 'tool_use') {
      state.activityKindByIndex.set(event.index, 'tool');
      return [
        {
          type: 'activity-start',
          activityId: `${turnId}-b${event.index}`,
          kind: 'tool',
          label: ACTIVITY_LABELS.tool(block.name),
        },
      ];
    }
    return [];
  }

  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') return [{ type: 'text', text: event.delta.text }];
    if (event.delta.type === 'thinking_delta') {
      return [{ type: 'activity-delta', activityId: `${turnId}-b${event.index}`, text: event.delta.thinking }];
    }
    return [];
  }

  if (event.type === 'content_block_stop' && state.activityKindByIndex.has(event.index)) {
    state.activityKindByIndex.delete(event.index);
    return [{ type: 'activity-end', activityId: `${turnId}-b${event.index}` }];
  }

  return [];
}

export function createClaudeGateway(log: LayerLogger): LlmGateway {
  return {
    provider: 'claude',
    async *streamTurn(request: GatewayRequest): AsyncIterable<GatewayEvent> {
      const options: Options = {
        model: request.model,
        systemPrompt: request.systemPrompt,
        tools: [],
        maxTurns: SINGLE_ANSWER_MAX_TURNS,
        includePartialMessages: true,
        persistSession: false,
        thinking: THINKING_CONFIG,
      };
      log.debug('gateway.call', `Calling Claude via Agent SDK, model ${request.model}`, {
        turnId: request.turnId,
        data: { messageCount: request.messages.length },
      });

      try {
        const stream = query({ prompt: renderPromptFromMessages(request.messages), options });
        const blockState = createStreamBlockState();
        for await (const message of stream) {
          yield* gatewayEventsFromSdkMessage(message, request.turnId, blockState);
          if (message.type === 'result') {
            if (message.subtype === 'success') {
              yield {
                type: 'done',
                model: request.model,
                usage: usageFromResult(message.usage),
                costUsd: message.total_cost_usd,
                providerDurationMs: message.duration_api_ms,
              };
            } else {
              const detail = message.errors.length > 0 ? message.errors.join('; ') : 'no detail from provider';
              yield { type: 'error', message: `Provider run failed (${message.subtype}): ${detail}` };
            }
            return;
          }
        }
        yield { type: 'error', message: 'Provider stream ended without a result message' };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        log.error('gateway.error', `Claude adapter failed: ${message}`, {
          turnId: request.turnId,
        });
        yield { type: 'error', message };
      }
    },
  };
}
