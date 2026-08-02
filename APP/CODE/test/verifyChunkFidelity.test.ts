import { describe, expect, it } from 'vitest';
import { verifyChunkFidelity } from '../src/tools/authoring/verifyChunkFidelity.js';
import type { GatewayEvent, GatewayRequest } from '../src/contracts/gateway.js';
import type { KnowledgeChunk } from '../src/contracts/knowledge.js';
import type { ExtractedPage } from '../src/tools/ingestion/pdfExtract.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';
import { createLogger } from '../src/logging/logger.js';

const log = createLogger('error', () => {}).child('authoring');

function chunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: 'c1',
    heading: 'Heading',
    text: 'Some chunk text.',
    sourceTitle: 'Doc',
    sourceUrl: 'doc.pdf#page=1',
    fetchedAt: '2026-08-01',
    ...overrides,
  };
}

function pages(text: string): ExtractedPage[] {
  return [{ pageNumber: 1, text }];
}

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

function gatewayErroring(message: string): LlmGateway {
  return {
    provider: 'fake',
    async *streamTurn(): AsyncIterable<GatewayEvent> {
      yield { type: 'error', message };
    },
  };
}

describe('verifyChunkFidelity', () => {
  it('returns a clean verdict from a well-formed model response', async () => {
    const gateway = gatewayReturning(
      JSON.stringify({ verdict: 'clean', missingFacts: [], suspiciousAdditions: [] }),
    );
    const result = await verifyChunkFidelity(gateway, 'test-model', pages('Full source text.'), [chunk()], log);
    expect(result).toEqual({ verdict: 'clean', missingFacts: [], suspiciousAdditions: [] });
  });

  it('surfaces missing facts and suspicious additions the model flags', async () => {
    const gateway = gatewayReturning(
      JSON.stringify({
        verdict: 'issues-found',
        missingFacts: ['$82,340 cumulative turnover'],
        suspiciousAdditions: ['a figure not present anywhere in the source'],
      }),
    );
    const result = await verifyChunkFidelity(gateway, 'test-model', pages('Full source text.'), [chunk()], log);
    expect(result.verdict).toBe('issues-found');
    expect(result.missingFacts).toEqual(['$82,340 cumulative turnover']);
    expect(result.suspiciousAdditions).toEqual(['a figure not present anywhere in the source']);
  });

  it('strips a markdown code fence the model wraps the JSON in despite being told not to', async () => {
    const gateway = gatewayReturning(
      '```json\n' + JSON.stringify({ verdict: 'clean', missingFacts: [], suspiciousAdditions: [] }) + '\n```',
    );
    const result = await verifyChunkFidelity(gateway, 'test-model', pages('text'), [chunk()], log);
    expect(result.verdict).toBe('clean');
  });

  it('throws a specific error when the model returns invalid JSON, rather than silently returning garbage', async () => {
    const gateway = gatewayReturning('this is not json at all');
    await expect(
      verifyChunkFidelity(gateway, 'test-model', pages('text'), [chunk()], log),
    ).rejects.toThrow(/did not return valid fidelity-report JSON/);
  });

  it('throws a specific error when the gateway itself errors', async () => {
    const gateway = gatewayErroring('provider unavailable');
    await expect(
      verifyChunkFidelity(gateway, 'test-model', pages('text'), [chunk()], log),
    ).rejects.toThrow(/provider unavailable/);
  });

  it('returns immediately with no gateway call for an empty chunk list', async () => {
    let called = false;
    const gateway: LlmGateway = {
      provider: 'fake',
      async *streamTurn() {
        called = true;
        yield { type: 'text', text: '{}' };
      },
    };
    const result = await verifyChunkFidelity(gateway, 'test-model', pages('text'), [], log);
    expect(result).toEqual({ verdict: 'clean', missingFacts: [], suspiciousAdditions: [] });
    expect(called).toBe(false);
  });
});
