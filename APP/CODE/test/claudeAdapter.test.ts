import { describe, expect, it } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createStreamBlockState,
  gatewayEventsFromSdkMessage,
  isVacuousSuccess,
  renderPromptFromMessages,
} from '../src/gateway/adapters/claude.js';

/** Build a minimal stream_event SDK message (only fields the mapper reads). */
function streamEvent(event: unknown): SDKMessage {
  return {
    type: 'stream_event',
    event,
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000000',
    session_id: 'test',
  } as SDKMessage;
}

describe('gatewayEventsFromSdkMessage', () => {
  it('maps text deltas to text events', () => {
    const state = createStreamBlockState();
    const events = gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }),
      'turn1',
      state,
    );
    expect(events).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('maps a thinking block to activity start/delta/end keyed by turn+index', () => {
    const state = createStreamBlockState();
    const start = gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '', signature: '' } }),
      'turn1',
      state,
    );
    expect(start).toEqual([
      { type: 'activity-start', activityId: 'turn1-b1', kind: 'thinking', label: 'Thought process' },
    ]);

    const delta = gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
      'turn1',
      state,
    );
    expect(delta).toEqual([{ type: 'activity-delta', activityId: 'turn1-b1', text: 'hmm' }]);

    const end = gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_stop', index: 1 }),
      'turn1',
      state,
    );
    expect(end).toEqual([{ type: 'activity-end', activityId: 'turn1-b1' }]);
  });

  it('does NOT emit activity-end for a plain text block stop', () => {
    const state = createStreamBlockState();
    gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      'turn1',
      state,
    );
    const stop = gatewayEventsFromSdkMessage(
      streamEvent({ type: 'content_block_stop', index: 0 }),
      'turn1',
      state,
    );
    expect(stop).toEqual([]);
  });

  it('labels tool_use blocks with the tool name', () => {
    const state = createStreamBlockState();
    const events = gatewayEventsFromSdkMessage(
      streamEvent({
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
      }),
      'turn1',
      state,
    );
    expect(events).toEqual([
      { type: 'activity-start', activityId: 'turn1-b2', kind: 'tool', label: 'Using tool: Bash' },
    ]);
  });
});

describe('renderPromptFromMessages', () => {
  it('passes a single message through unchanged', () => {
    expect(renderPromptFromMessages([{ role: 'user', content: 'hi' }])).toBe('hi');
  });
});

describe('isVacuousSuccess', () => {
  it('flags a result with zero usage on every axis', () => {
    expect(
      isVacuousSuccess({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ).toBe(true);
  });

  it('does not flag a real result with billable output tokens', () => {
    expect(
      isVacuousSuccess({
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ).toBe(false);
  });

  it('does not flag a cache-only turn (real work, just no fresh tokens)', () => {
    expect(
      isVacuousSuccess({
        input_tokens: 0,
        output_tokens: 3,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      }),
    ).toBe(false);
  });
});
