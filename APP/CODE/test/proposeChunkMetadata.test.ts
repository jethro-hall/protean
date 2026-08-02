import { describe, expect, it } from 'vitest';
import { proposeChunkMetadata } from '../src/tools/authoring/proposeChunkMetadata.js';
import type { GatewayEvent, GatewayRequest } from '../src/contracts/gateway.js';
import type { KnowledgeChunk } from '../src/contracts/knowledge.js';
import type { LlmGateway } from '../src/gateway/LlmGateway.js';
import { createLogger } from '../src/logging/logger.js';

const log = createLogger('error', () => {}).child('authoring');

function chunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: 'c1',
    heading: 'Extractive heading',
    text: 'Some source text.',
    sourceTitle: 'Doc',
    sourceUrl: 'doc.pdf#page=1',
    fetchedAt: '2026-08-01',
    ...overrides,
  };
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

describe('proposeChunkMetadata', () => {
  it('returns proposals paired with valid chunkIds from a well-formed model response', async () => {
    const chunks = [chunk({ id: 'a' }), chunk({ id: 'b' })];
    const gateway = gatewayReturning(
      JSON.stringify({
        proposals: [
          { chunkId: 'a', heading: 'Heading A', summary: 'Summary A.' },
          { chunkId: 'b', heading: 'Heading B', summary: 'Summary B.' },
        ],
      }),
    );
    const result = await proposeChunkMetadata(gateway, 'test-model', chunks, log);
    expect(result.proposals).toEqual([
      { chunkId: 'a', heading: 'Heading A', summary: 'Summary A.' },
      { chunkId: 'b', heading: 'Heading B', summary: 'Summary B.' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('strips a markdown code fence the model wraps the JSON in despite being told not to', async () => {
    const chunks = [chunk({ id: 'a' })];
    const gateway = gatewayReturning(
      '```json\n' + JSON.stringify({ proposals: [{ chunkId: 'a', heading: 'H', summary: 'S.' }] }) + '\n```',
    );
    const result = await proposeChunkMetadata(gateway, 'test-model', chunks, log);
    expect(result.proposals).toHaveLength(1);
  });

  it('discards a proposal referencing a chunkId that was never in the input, with a warning', async () => {
    const chunks = [chunk({ id: 'a' })];
    const gateway = gatewayReturning(
      JSON.stringify({
        proposals: [
          { chunkId: 'a', heading: 'H', summary: 'S.' },
          { chunkId: 'not-a-real-chunk', heading: 'Bogus', summary: 'Bogus.' },
        ],
      }),
    );
    const result = await proposeChunkMetadata(gateway, 'test-model', chunks, log);
    expect(result.proposals).toEqual([{ chunkId: 'a', heading: 'H', summary: 'S.' }]);
    expect(result.warnings.some((w) => w.includes('not-a-real-chunk'))).toBe(true);
  });

  it('warns, but does not throw, when a chunk gets no proposal at all', async () => {
    const chunks = [chunk({ id: 'a' }), chunk({ id: 'b', heading: 'Chunk B fallback' })];
    const gateway = gatewayReturning(JSON.stringify({ proposals: [{ chunkId: 'a', heading: 'H', summary: 'S.' }] }));
    const result = await proposeChunkMetadata(gateway, 'test-model', chunks, log);
    expect(result.proposals).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('Chunk B fallback'))).toBe(true);
  });

  it('throws a specific error when the model returns invalid JSON, rather than silently returning garbage', async () => {
    const chunks = [chunk()];
    const gateway = gatewayReturning('this is not json at all');
    await expect(proposeChunkMetadata(gateway, 'test-model', chunks, log)).rejects.toThrow(
      /did not return valid proposal JSON/,
    );
  });

  it('throws a specific error when the gateway itself errors', async () => {
    const chunks = [chunk()];
    const gateway = gatewayErroring('provider unavailable');
    await expect(proposeChunkMetadata(gateway, 'test-model', chunks, log)).rejects.toThrow(
      /provider unavailable/,
    );
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
    const result = await proposeChunkMetadata(gateway, 'test-model', [], log);
    expect(result).toEqual({ proposals: [], warnings: [] });
    expect(called).toBe(false);
  });
});
