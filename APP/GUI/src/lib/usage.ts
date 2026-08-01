import type { Conversation } from '../state/appState';

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  /** Sum of known per-turn costs. Null when no assistant message in this conversation has a cost figure yet. */
  costUsd: number | null;
  /** True when at least one assistant turn had token usage but no cost figure (e.g. a custom provider) — the total is a partial sum, not the whole conversation's cost. */
  costIncomplete: boolean;
}

/** Sum real, per-turn usage/cost across a conversation. Derived, not stored — never drifts from the message list. */
export function sumConversationUsage(conversation: Conversation): UsageTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd: number | null = null;
  let costIncomplete = false;

  for (const message of conversation.messages) {
    if (message.role !== 'assistant' || message.stats?.usage === null || message.stats?.usage === undefined) {
      continue;
    }
    inputTokens += message.stats.usage.inputTokens;
    outputTokens += message.stats.usage.outputTokens;
    if (message.stats.costUsd === null) {
      costIncomplete = true;
    } else {
      costUsd = (costUsd ?? 0) + message.stats.costUsd;
    }
  }

  return { inputTokens, outputTokens, costUsd, costIncomplete };
}

export function formatTokenCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function formatCostUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
