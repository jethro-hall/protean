import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentCore, AgentEvent } from '../src/agent/AgentCore.js';
import { NO_TOOLS_POLICY } from '../src/contracts/agentLoop.js';
import { domainPackSchema } from '../src/contracts/domainPack.js';
import type { TurnEvent, TurnRequest } from '../src/contracts/turn.js';
import { createLogger } from '../src/logging/logger.js';
import { createMemoryCacheStore } from '../src/watcher/cache.js';
import { runTurn, type TurnPipelineDeps } from '../src/watcher/runTurn.js';
import { createMemorySessionStore } from '../src/watcher/sessionStore.js';

const pack = domainPackSchema.parse({
  id: 'testpack',
  displayName: 'Test pack',
  version: '0.0.1',
  systemPrompt: 'You are a test assistant.',
});

const request: TurnRequest = { sessionId: 's1', domainId: 'testpack', input: 'ping' };

function fakeAgent(events: () => AsyncIterable<AgentEvent>): AgentCore {
  return { name: 'fake', runTurn: events };
}

async function collect(iterable: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function makeDeps(agent: AgentCore): TurnPipelineDeps & { dataDir: string } {
  const dataDir = mkdtempSync(join(tmpdir(), 'protean-test-'));
  const logger = createLogger('error', () => {});
  return {
    agent,
    cache: createMemoryCacheStore(60, 10),
    pack,
    history: [],
    model: 'test-model',
    watcher: { turnTokenBudget: 8000, rewriteEnabled: false, rewriteBloatTokens: 600 },
    toolPolicy: NO_TOOLS_POLICY,
    workspaceDir: dataDir,
    log: logger.child('watcher'),
    promptHistoryDir: join(dataDir, 'prompt-history'),
    tokenTelemetryDir: join(dataDir, 'token-telemetry'),
    dataDir,
  };
}

const successAgent = fakeAgent(async function* () {
  yield { type: 'text' as const, text: 'pong ' };
  yield { type: 'text' as const, text: 'pong' };
  yield {
    type: 'done' as const,
    model: 'test-model',
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0.001,
    providerDurationMs: 42,
  };
});

describe('runTurn pipeline', () => {
  it('forwards agent activity events and records thinking in lineage', async () => {
    const thinkingAgent = fakeAgent(async function* () {
      yield { type: 'activity-start' as const, activityId: 't-b0', kind: 'thinking' as const, label: 'Thought process' };
      yield { type: 'activity-delta' as const, activityId: 't-b0', text: 'let me reason' };
      yield { type: 'activity-end' as const, activityId: 't-b0' };
      yield { type: 'text' as const, text: 'answer' };
      yield {
        type: 'done' as const,
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: 0,
        providerDurationMs: 1,
      };
    });
    const deps = makeDeps(thinkingAgent);
    const events = await collect(runTurn(request, deps));
    expect(events.map((e) => e.type)).toEqual([
      'activity-start',
      'activity-delta',
      'activity-end',
      'text',
      'done',
    ]);
    const lineageFile = readdirSync(join(deps.dataDir, 'prompt-history'))[0];
    if (lineageFile === undefined) throw new Error('no lineage written');
    const row = JSON.parse(
      readFileSync(join(deps.dataDir, 'prompt-history', lineageFile), 'utf8').trim().split('\n')[0] ?? '',
    ) as { thinking: string | null };
    expect(row.thinking).toBe('let me reason');
  });

  it('emits a stage activity per attachment and keeps the file in session history', async () => {
    const deps = makeDeps(successAgent);
    const sessions = createMemorySessionStore();
    const withFile: TurnRequest = {
      ...request,
      attachments: [{ name: 'data.json', mimeType: 'application/json', textContent: '{"x":2}' }],
    };
    const events = await collect(runTurn(withFile, { ...deps, sessions }));
    const stage = events.find((e) => e.type === 'activity-start');
    if (stage?.type !== 'activity-start') throw new Error('expected stage activity');
    expect(stage.kind).toBe('stage');
    expect(stage.label).toContain('data.json');
    const userRow = sessions.history(request.sessionId).find((m) => m.role === 'user');
    expect(userRow?.content).toContain('{"x":2}');
  });

  it('streams text, reports a miss, then serves the identical turn from cache', async () => {
    const deps = makeDeps(successAgent);
    const first = await collect(runTurn(request, deps));
    const firstDone = first.at(-1);
    expect(firstDone?.type).toBe('done');
    if (firstDone?.type !== 'done') return;
    expect(firstDone.cacheHit).toBe(false);
    expect(first.filter((e) => e.type === 'text').length).toBe(2);

    const second = await collect(runTurn(request, deps));
    const secondDone = second.at(-1);
    if (secondDone?.type !== 'done') throw new Error('expected done');
    expect(secondDone.cacheHit).toBe(true);
    expect(second.find((e) => e.type === 'text')).toEqual({ type: 'text', text: 'pong pong' });
    expect(secondDone.timings.totalMs ?? Infinity).toBeLessThan(300);
  });

  it('writes lineage and telemetry JSONL rows for each turn', async () => {
    const deps = makeDeps(successAgent);
    await collect(runTurn(request, deps));
    const lineageFiles = readdirSync(deps.promptHistoryDir);
    const telemetryFiles = readdirSync(deps.tokenTelemetryDir);
    expect(lineageFiles).toHaveLength(1);
    expect(telemetryFiles).toHaveLength(1);
    const lineageFile = lineageFiles[0];
    if (lineageFile === undefined) throw new Error('no lineage file');
    const row = JSON.parse(readFileSync(join(deps.promptHistoryDir, lineageFile), 'utf8').trim());
    expect(row.input).toBe('ping');
    expect(row.output).toBe('pong pong');
    expect(row.cacheHit).toBe(false);
    expect(row.timings.totalMs).toBeGreaterThan(0);
  });

  it('rewrites a bloated input when enabled, records it in lineage, and keys the cache on it', async () => {
    const deps = makeDeps(successAgent);
    const rewritingGateway: import('../src/gateway/LlmGateway.js').LlmGateway = {
      provider: 'fake-rewriter',
      async *streamTurn() {
        yield { type: 'text' as const, text: 'compressed prompt' };
        yield { type: 'done' as const, model: 'fast', usage: null, costUsd: null, providerDurationMs: 1 };
      },
    };
    const bloated = 'blah '.repeat(1000);
    const rewriteDeps: TurnPipelineDeps = {
      ...deps,
      gateway: rewritingGateway,
      watcher: { turnTokenBudget: 8000, rewriteEnabled: true, rewriteBloatTokens: 100, fastModel: 'fast' },
    };
    const events = await collect(runTurn({ ...request, input: bloated }, rewriteDeps));
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.timings.rewriteMs).toBeGreaterThanOrEqual(0);

    const lineageFile = readdirSync(deps.promptHistoryDir)[0];
    if (lineageFile === undefined) throw new Error('no lineage file');
    const row = JSON.parse(readFileSync(join(deps.promptHistoryDir, lineageFile), 'utf8').trim());
    expect(row.rewrite).toBe('compressed prompt');
    expect(row.assembledMessages.at(-1).content).toBe('compressed prompt');
    // identical bloated input again → rewrite produces the same prompt → cache HIT
    const second = await collect(runTurn({ ...request, input: bloated }, rewriteDeps));
    const secondDone = second.at(-1);
    if (secondDone?.type !== 'done') throw new Error('expected done');
    expect(secondDone.cacheHit).toBe(true);
  });

  it('streams artefacts to the preview protocol, saves them, and keeps raw output in history', async () => {
    const artefactAgent = fakeAgent(async function* () {
      yield { type: 'text' as const, text: 'Building it now: <protean:artefact type="html" ' };
      yield { type: 'text' as const, text: 'title="Board memo"><h1>Memo</h1>' };
      yield { type: 'text' as const, text: '</protean:artefact> Done!' };
      yield {
        type: 'done' as const,
        model: 'test-model',
        usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
        costUsd: 0,
        providerDurationMs: 1,
      };
    });
    const deps = makeDeps(artefactAgent);
    const artefactsDir = join(deps.dataDir, 'artefacts');
    const sessions = createMemorySessionStore();
    const events = await collect(runTurn(request, { ...deps, artefactsDir, sessions }));

    const chatText = events
      .filter((e): e is Extract<TurnEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.text)
      .join('');
    expect(chatText).toBe('Building it now:  Done!');

    const start = events.find((e) => e.type === 'artefact-start');
    if (start?.type !== 'artefact-start') throw new Error('no artefact-start');
    expect(start.title).toBe('Board memo');
    const end = events.find((e) => e.type === 'artefact-end');
    if (end?.type !== 'artefact-end') throw new Error('no artefact-end');
    expect(end.complete).toBe(true);
    if (end.savedPath === null) throw new Error('artefact not saved');
    expect(readFileSync(end.savedPath, 'utf8')).toBe('<h1>Memo</h1>');

    // raw output (incl. tags) is in session history so follow-ups can edit the artefact
    const history = sessions.history(request.sessionId);
    expect(history.at(-1)?.content).toContain('<protean:artefact');
    expect(history.at(-1)?.content).toContain('<h1>Memo</h1>');

    // cache hit re-emits artefact events but does not re-save
    const second = await collect(runTurn(request, { ...deps, artefactsDir, sessions, history: [] }));
    const secondEnd = second.find((e) => e.type === 'artefact-end');
    if (secondEnd?.type !== 'artefact-end') throw new Error('no artefact-end on hit');
    expect(secondEnd.savedPath).toBeNull();
    const secondDone = second.at(-1);
    if (secondDone?.type !== 'done') throw new Error('expected done');
    expect(secondDone.cacheHit).toBe(true);
  });

  it('emits an error event and does NOT cache when the agent fails', async () => {
    const failingAgent = fakeAgent(async function* () {
      yield { type: 'text' as const, text: 'partial' };
      yield { type: 'error' as const, message: 'provider exploded' };
    });
    const deps = makeDeps(failingAgent);
    const events = await collect(runTurn(request, deps));
    expect(events.at(-1)?.type).toBe('error');
    expect(deps.cache.size()).toBe(0);

    // a subsequent successful turn must still be a MISS (failure was not cached)
    const retryDeps = { ...deps, agent: successAgent };
    const retry = await collect(runTurn(request, retryDeps));
    const retryDone = retry.at(-1);
    if (retryDone?.type !== 'done') throw new Error('expected done');
    expect(retryDone.cacheHit).toBe(false);
  });
});
