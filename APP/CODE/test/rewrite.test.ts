import { describe, expect, it } from 'vitest';
import type { GatewayEvent, GatewayRequest } from '../src/contracts/gateway.js';
import type { AssembledTurn } from '../src/contracts/turn.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';
import { createLogger } from '../src/logging/logger.js';
import { rewriteTurnInput, shouldRewriteTurn } from '../src/watcher/rewrite.js';

const log = createLogger('error', () => {}).child('watcher');

function turn(input: string): AssembledTurn {
  return {
    turnId: 't1',
    sessionId: 's1',
    domainId: 'generic',
    input,
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: input }],
    tier: 'fast',
    model: 'm',
    toolsetVersion: 'v0',
  };
}

function gatewayReturning(events: GatewayEvent[]): LlmGateway {
  return {
    provider: 'fake',
    async *streamTurn(_request: GatewayRequest) {
      yield* events;
    },
  };
}

describe('shouldRewriteTurn (deterministic gate)', () => {
  it('fires only above the bloat threshold', () => {
    expect(shouldRewriteTurn(turn('short input'), 100).rewrite).toBe(false);
    expect(shouldRewriteTurn(turn('x'.repeat(4 * 150)), 100).rewrite).toBe(true);
  });

  it('explains its decision in the reason', () => {
    expect(shouldRewriteTurn(turn('hi'), 100).reason).toContain('deterministic path');
    expect(shouldRewriteTurn(turn('x'.repeat(4 * 150)), 100).reason).toContain('bloat threshold');
  });
});

describe('rewriteTurnInput', () => {
  it('returns the model rewrite and measures it', async () => {
    const gateway = gatewayReturning([
      { type: 'text', text: 'compressed ' },
      { type: 'text', text: 'prompt' },
      { type: 'done', model: 'fast', usage: null, costUsd: null, providerDurationMs: 5 },
    ]);
    const result = await rewriteTurnInput(gateway, turn('a very long original'), 'fast-model', log);
    expect(result.text).toBe('compressed prompt');
    expect(result.rewriteMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the original input on provider error (logged, not silent)', async () => {
    const gateway = gatewayReturning([{ type: 'error', message: 'boom' }]);
    const original = 'the original input survives';
    const result = await rewriteTurnInput(gateway, turn(original), 'fast-model', log);
    expect(result.text).toBe(original);
  });

  it('falls back on empty rewrite output', async () => {
    const gateway = gatewayReturning([
      { type: 'text', text: '   ' },
      { type: 'done', model: 'fast', usage: null, costUsd: null, providerDurationMs: 1 },
    ]);
    const result = await rewriteTurnInput(gateway, turn('keep me'), 'fast-model', log);
    expect(result.text).toBe('keep me');
  });
});
