import type { ToolPolicy } from './agentLoop.js';
import type { ProteanMcpServerBinding } from './connectors.js';
import type { ChatMessage, EffortLevel, TokenUsage } from './turn.js';

/**
 * The ONE internal protocol the app speaks to the gateway (INFRASTRUCTURE decision).
 * Nothing vendor-shaped crosses this boundary in either direction.
 */
export interface GatewayRequest {
  turnId: string;
  model: string;
  /**
   * System prompt. Prefer static/dynamic split so the Claude adapter can place
   * a prompt-cache boundary (Bedrock/Anthropic). Plain string remains valid
   * for rewrite and other single-shot paths.
   */
  systemPrompt: string | { staticPrefix: string; dynamicSuffix: string };
  messages: ChatMessage[];
  /**
   * Dynamic agent-loop policy for answering turns. Omit (or empty tools) for
   * single-shot paths like the Tier-1 rewrite.
   */
  toolPolicy?: ToolPolicy;
  /** Workspace root for file tools (Read/Grep/Glob). Required when tools are enabled. */
  workspaceDir?: string;
  /**
   * Provider-neutral MCP bindings from the Tool/Connector Registry.
   * Claude adapter materializes vendor mcpServers (Law 5).
   */
  mcpServers?: ProteanMcpServerBinding[];
  /** Datasets root for in-process MCP handlers (data lake / calendar fixtures). */
  datasetsDir?: string;
  /** Domains root — required by the knowledgeBase MCP handler (Phase 6 POC). */
  domainsDir?: string;
  /** Knowledge collection ids the knowledgeBase MCP handler may query this turn. */
  knowledgeCollectionIds?: string[];
  /** Reasoning effort (Phase 6) — the Claude adapter maps this to Options.effort. */
  effort?: EffortLevel;
  /** Sampling temperature (Phase 6) — the custom-provider adapter only; the Claude adapter has no such vendor field. */
  temperature?: number;
  /** Max response tokens (Phase 6) — the custom-provider adapter only. */
  maxTokens?: number;
  /** When aborted, the provider adapter must seize the model run immediately. */
  abortSignal?: AbortSignal;
}

export type GatewayEvent =
  | { type: 'text'; text: string }
  | { type: 'activity-start'; activityId: string; kind: 'thinking' | 'tool'; label: string }
  | { type: 'activity-delta'; activityId: string; text: string }
  | { type: 'activity-end'; activityId: string }
  | {
      type: 'done';
      model: string;
      usage: TokenUsage | null;
      costUsd: number | null;
      providerDurationMs: number | null;
    }
  | { type: 'error'; message: string };
