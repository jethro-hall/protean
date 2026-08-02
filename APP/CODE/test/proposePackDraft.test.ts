import { describe, expect, it } from 'vitest';
import { proposePackDraft } from '../src/tools/authoring/proposePackDraft.js';
import type { GatewayEvent, GatewayRequest } from '../src/contracts/gateway.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';

function gatewayReturning(text: string): LlmGateway {
  return {
    provider: 'fake',
    async *streamTurn(_request: GatewayRequest): AsyncIterable<GatewayEvent> {
      yield { type: 'text', text };
      yield {
        type: 'done',
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: 0,
        providerDurationMs: 1,
      };
    },
  };
}

const input = {
  documentTitle: 'ATO R&D Guide',
  sections: [
    { heading: 'Eligibility', summary: 'Who can claim.' },
    { heading: 'Registration', summary: 'How to register.' },
  ],
};

describe('proposePackDraft', () => {
  it('returns a validated pack draft from a well-formed model response', async () => {
    const gateway = gatewayReturning(
      JSON.stringify({
        displayName: 'R&D Tax Advisor',
        systemPrompt: 'You are an R&D tax incentive specialist.',
        vocabulary: { 'R&D': 'Research and Development' },
      }),
    );
    const draft = await proposePackDraft(gateway, 'test-model', input);
    expect(draft.displayName).toBe('R&D Tax Advisor');
    expect(draft.systemPrompt).toContain('R&D tax incentive');
    expect(draft.vocabulary).toEqual({ 'R&D': 'Research and Development' });
  });

  it('defaults vocabulary to {} when the model omits it', async () => {
    const gateway = gatewayReturning(
      JSON.stringify({ displayName: 'Name', systemPrompt: 'Prompt.' }),
    );
    const draft = await proposePackDraft(gateway, 'test-model', input);
    expect(draft.vocabulary).toEqual({});
  });

  it('strips a markdown code fence around the JSON', async () => {
    const gateway = gatewayReturning(
      '```json\n' + JSON.stringify({ displayName: 'N', systemPrompt: 'P.' }) + '\n```',
    );
    const draft = await proposePackDraft(gateway, 'test-model', input);
    expect(draft.displayName).toBe('N');
  });

  it('throws a specific error on invalid JSON, never returning a partial/garbage draft', async () => {
    const gateway = gatewayReturning('not json');
    await expect(proposePackDraft(gateway, 'test-model', input)).rejects.toThrow(
      /did not return valid pack draft JSON/,
    );
  });

  it('throws a specific error when the gateway errors', async () => {
    const gateway: LlmGateway = {
      provider: 'fake',
      async *streamTurn() {
        yield { type: 'error', message: 'timeout' };
      },
    };
    await expect(proposePackDraft(gateway, 'test-model', input)).rejects.toThrow(/timeout/);
  });
});
