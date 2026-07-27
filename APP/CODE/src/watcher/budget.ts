import type { ChatMessage } from '../contracts/turn.js';

/**
 * Watcher step 2 — BUDGET (pure code, Law 4). Deterministic token estimation
 * and history trimming so token count grows sub-linearly (ARCHITECTURE §5).
 */

/**
 * Chars-per-token heuristic for budgeting. This is an ESTIMATOR for trimming
 * decisions only — real token counts come back from the provider and are what
 * telemetry records (we never present an estimate as a fact).
 */
export const ESTIMATE_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATE_CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

export interface BudgetResult {
  messages: ChatMessage[];
  estimatedTokens: number;
  droppedMessages: number;
}

/**
 * Trim OLDEST history first until the estimate fits the budget. The final
 * message (the new user input) is never dropped, whatever its size.
 */
export function budgetMessages(messages: ChatMessage[], tokenBudget: number): BudgetResult {
  const kept = [...messages];
  let dropped = 0;
  while (kept.length > 1 && estimateMessagesTokens(kept) > tokenBudget) {
    kept.shift();
    dropped += 1;
  }
  return {
    messages: kept,
    estimatedTokens: estimateMessagesTokens(kept),
    droppedMessages: dropped,
  };
}
