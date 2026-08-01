/**
 * Claude adapter for the LlmGateway — the ONLY file that may import the vendor
 * SDK (Law 5). Serves both auth routes behind one adapter: AWS Bedrock
 * (CLAUDE_CODE_USE_BEDROCK=1 + AWS_* env) and the direct Anthropic API
 * (ANTHROPIC_API_KEY) — the SDK subprocess picks the route from env.
 *
 * API surface verified against installed @anthropic-ai/claude-agent-sdk 0.3.220
 * type declarations: query({ prompt, options }),
 * Options.{model,systemPrompt,tools,allowedTools,maxTurns,permissionMode,cwd,
 * includePartialMessages,persistSession,thinking,effort}, stream + tool_progress.
 * Confirmed there is NO temperature field anywhere in Options (Phase 6 sampling
 * controls) — only `effort` is real for this SDK; temperature only applies to
 * the custom-provider adapter (gateway/adapters/customProvider.ts).
 */
import {
  query,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { TURN_STOPPED_MESSAGE } from '../../config/defaults.js';
import { NO_TOOLS_POLICY, type ToolPolicy } from '../../contracts/agentLoop.js';
import type { GatewayEvent, GatewayRequest } from '../../contracts/gateway.js';
import type { ChatMessage, TokenUsage } from '../../contracts/turn.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { LlmGateway } from '../LlmGateway.js';
import { materializeMcpServers } from './claudeMcp.js';

/**
 * Adaptive thinking: the model decides when/how deeply to reason, and the raw
 * stream carries thinking blocks we surface as REAL activity (never cosmetic).
 * Verified against sdk.d.ts 0.3.220 ThinkingConfig.
 */
const THINKING_CONFIG = { type: 'adaptive' } as const;

const ACTIVITY_LABELS = {
  thinking: 'Thought process',
  tool: (name: string): string => `Using tool: ${name}`,
  toolProgress: (name: string, seconds: number): string =>
    `${name} still running (${seconds.toFixed(1)}s)`,
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

/** Tracks stream content-block indexes and tool_use ids for activity events. */
export interface StreamBlockState {
  activityKindByIndex: Map<number, 'thinking' | 'tool'>;
  activityIdByToolUseId: Map<string, string>;
}

export function createStreamBlockState(): StreamBlockState {
  return { activityKindByIndex: new Map(), activityIdByToolUseId: new Map() };
}

export function resolveToolPolicy(request: GatewayRequest): ToolPolicy {
  return request.toolPolicy ?? NO_TOOLS_POLICY;
}

/** Link a parent AbortSignal to a fresh AbortController for the SDK. */
export function abortControllerFromSignal(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (signal === undefined) return controller;
  if (signal.aborted) {
    controller.abort();
    return controller;
  }
  signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

/** Map Gateway system prompt → SDK Options.systemPrompt (cache boundary when split). */
export function resolveSdkSystemPrompt(
  systemPrompt: GatewayRequest['systemPrompt'],
): Exclude<Options['systemPrompt'], undefined> {
  if (typeof systemPrompt === 'string') return systemPrompt;
  // Blocks before SYSTEM_PROMPT_DYNAMIC_BOUNDARY are eligible for Bedrock/Anthropic
  // prompt-cache across turns (sdk.d.ts Options.systemPrompt string[] form).
  return [systemPrompt.staticPrefix, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, systemPrompt.dynamicSuffix];
}

/** Built-in SDK tool names only — MCP tools come from mcpServers, not `tools`. */
export function builtinToolsFromPolicy(policy: ToolPolicy): string[] {
  return policy.availableTools.filter((name) => !name.startsWith('mcp__'));
}

/** Map Protean tool policy → Claude Agent SDK Options fields (adapter-only). */
export function buildClaudeQueryOptions(request: GatewayRequest): Options {
  const policy = resolveToolPolicy(request);
  const builtinTools = builtinToolsFromPolicy(policy);
  const options: Options = {
    model: request.model,
    systemPrompt: resolveSdkSystemPrompt(request.systemPrompt),
    tools: [...builtinTools],
    allowedTools: [...policy.allowedTools],
    maxTurns: policy.maxTurns,
    permissionMode: policy.permissionMode,
    includePartialMessages: true,
    persistSession: false,
    thinking: THINKING_CONFIG,
    abortController: abortControllerFromSignal(request.abortSignal),
    strictMcpConfig: true,
  };
  if (request.effort !== undefined) {
    options.effort = request.effort;
  }
  if (request.workspaceDir !== undefined && request.workspaceDir !== '') {
    options.cwd = request.workspaceDir;
  }
  if (request.mcpServers !== undefined && request.mcpServers.length > 0) {
    const datasetsDir = request.datasetsDir;
    if (datasetsDir === undefined || datasetsDir === '') {
      throw new Error('GatewayRequest.datasetsDir is required when mcpServers are bound');
    }
    options.mcpServers = materializeMcpServers(
      request.mcpServers,
      datasetsDir,
      request.domainsDir,
      request.knowledgeCollectionIds,
      request.knowledgeCollectionWeights,
    );
  }
  return options;
}

/**
 * A `result` message with subtype 'success' but zero usage on every axis means
 * the provider did no billable work — a transient hang (subprocess spawn /
 * Bedrock auth) surfacing as a vacuous success rather than an error. Law 6
 * ("evidence or nothing") forbids treating that as a real, honest done event.
 */
export function isVacuousSuccess(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}): boolean {
  return (
    usage.input_tokens === 0 &&
    usage.output_tokens === 0 &&
    usage.cache_read_input_tokens === 0 &&
    usage.cache_creation_input_tokens === 0
  );
}

function isAbortError(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === 'AbortError') return true;
  const message = cause instanceof Error ? cause.message : String(cause);
  return /abort/i.test(message);
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
  if (message.type === 'tool_progress') {
    const activityId = state.activityIdByToolUseId.get(message.tool_use_id);
    if (activityId === undefined) return [];
    return [
      {
        type: 'activity-delta',
        activityId,
        text: ACTIVITY_LABELS.toolProgress(message.tool_name, message.elapsed_time_seconds),
      },
    ];
  }

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
      const activityId = `${turnId}-b${event.index}`;
      state.activityKindByIndex.set(event.index, 'tool');
      state.activityIdByToolUseId.set(block.id, activityId);
      return [
        {
          type: 'activity-start',
          activityId,
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
      const policy = resolveToolPolicy(request);
      const options = buildClaudeQueryOptions(request);
      log.debug('gateway.call', `Calling Claude via Agent SDK, model ${request.model}`, {
        turnId: request.turnId,
        data: {
          messageCount: request.messages.length,
          maxTurns: policy.maxTurns,
          tools: policy.availableTools,
          mcpServers: (request.mcpServers ?? []).map((server) => server.serverId),
          permissionMode: policy.permissionMode,
          cwd: request.workspaceDir ?? null,
        },
      });

      try {
        if (request.abortSignal?.aborted) {
          yield { type: 'error', message: TURN_STOPPED_MESSAGE };
          return;
        }
        const stream = query({ prompt: renderPromptFromMessages(request.messages), options });
        const blockState = createStreamBlockState();
        for await (const message of stream) {
          if (request.abortSignal?.aborted) {
            // Seize: abortController already fired; stop yielding and surface stop.
            yield { type: 'error', message: TURN_STOPPED_MESSAGE };
            return;
          }
          yield* gatewayEventsFromSdkMessage(message, request.turnId, blockState);
          if (message.type === 'result') {
            if (message.subtype === 'success' && isVacuousSuccess(message.usage)) {
              log.error(
                'gateway.vacuous_success',
                'Provider reported success with zero usage on every axis — treating as a failed run, not a silent stub',
                { turnId: request.turnId, data: { durationApiMs: message.duration_api_ms } },
              );
              yield {
                type: 'error',
                message:
                  'Provider run reported success but did no billable work (zero tokens) — likely a hung run. Please retry.',
              };
            } else if (message.subtype === 'success') {
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
        if (request.abortSignal?.aborted) {
          yield { type: 'error', message: TURN_STOPPED_MESSAGE };
          return;
        }
        yield { type: 'error', message: 'Provider stream ended without a result message' };
      } catch (cause) {
        if (request.abortSignal?.aborted || isAbortError(cause)) {
          log.info('gateway.stopped', TURN_STOPPED_MESSAGE, { turnId: request.turnId });
          yield { type: 'error', message: TURN_STOPPED_MESSAGE };
          return;
        }
        const message = cause instanceof Error ? cause.message : String(cause);
        log.error('gateway.error', `Claude adapter failed: ${message}`, {
          turnId: request.turnId,
        });
        yield { type: 'error', message };
      }
    },
  };
}
