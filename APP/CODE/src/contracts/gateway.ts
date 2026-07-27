import type { ChatMessage, TokenUsage } from './turn.js';

/**
 * The ONE internal protocol the app speaks to the gateway (INFRASTRUCTURE decision).
 * Nothing vendor-shaped crosses this boundary in either direction.
 */
export interface GatewayRequest {
  turnId: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
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
