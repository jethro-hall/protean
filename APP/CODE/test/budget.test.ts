import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/contracts/turn.js';
import {
  ESTIMATE_CHARS_PER_TOKEN,
  budgetMessages,
  estimateMessagesTokens,
  estimateTokens,
} from '../src/watcher/budget.js';

describe('estimateTokens', () => {
  it('rounds up chars/heuristic', () => {
    expect(estimateTokens('a'.repeat(ESTIMATE_CHARS_PER_TOKEN * 3 + 1))).toBe(4);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('budgetMessages', () => {
  const message = (content: string): ChatMessage => ({ role: 'user', content });

  it('drops oldest messages first until under budget', () => {
    const messages = [message('a'.repeat(400)), message('b'.repeat(400)), message('c'.repeat(400))];
    const result = budgetMessages(messages, 250); // each message ≈ 100 tokens
    expect(result.droppedMessages).toBe(1);
    expect(result.messages[0]?.content.startsWith('b')).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(250);
  });

  it('never drops the final user input, even oversized', () => {
    const messages = [message('history'), message('x'.repeat(10_000))];
    const result = budgetMessages(messages, 10);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.content.startsWith('x')).toBe(true);
  });

  it('leaves under-budget histories untouched', () => {
    const messages = [message('short'), message('also short')];
    const result = budgetMessages(messages, 1000);
    expect(result.droppedMessages).toBe(0);
    expect(result.messages).toHaveLength(2);
    expect(estimateMessagesTokens(result.messages)).toBe(result.estimatedTokens);
  });
});
