import { describe, expect, it } from 'vitest';
import type { RetrievalTelemetryEntry } from '../src/contracts/knowledge.js';
import { computeGroundingConfidence } from '../src/watcher/groundingConfidence.js';

function entry(overrides: Partial<RetrievalTelemetryEntry> = {}): RetrievalTelemetryEntry {
  return { query: 'anything', hitCount: 5, requestedLimit: 5, topScore: 0.9, ...overrides };
}

describe('computeGroundingConfidence', () => {
  it('returns undefined when the turn is not grounded, regardless of telemetry', () => {
    expect(computeGroundingConfidence(false, [entry({ hitCount: 0 })])).toBeUndefined();
  });

  it('returns undefined when grounded but the tool was never called (digest alone may have sufficed)', () => {
    expect(computeGroundingConfidence(true, [])).toBeUndefined();
  });

  it('returns "none" when the best retrieval call found zero hits', () => {
    expect(computeGroundingConfidence(true, [entry({ hitCount: 0, requestedLimit: 5 })])).toBe('none');
  });

  it('returns "low" when the best call found fewer than half its requested hits', () => {
    expect(computeGroundingConfidence(true, [entry({ hitCount: 1, requestedLimit: 5 })])).toBe('low');
  });

  it('returns undefined when hits are at least half the requested limit', () => {
    expect(computeGroundingConfidence(true, [entry({ hitCount: 3, requestedLimit: 5 })])).toBeUndefined();
    expect(computeGroundingConfidence(true, [entry({ hitCount: 5, requestedLimit: 5 })])).toBeUndefined();
  });

  it('uses the BEST of multiple calls this turn, not the first or last', () => {
    const telemetry = [
      entry({ query: 'weak', hitCount: 0, requestedLimit: 5 }),
      entry({ query: 'strong', hitCount: 5, requestedLimit: 5 }),
    ];
    expect(computeGroundingConfidence(true, telemetry)).toBeUndefined();
  });

  it('flags "low" even across multiple calls when the best is still thin', () => {
    const telemetry = [
      entry({ query: 'a', hitCount: 0, requestedLimit: 5 }),
      entry({ query: 'b', hitCount: 1, requestedLimit: 5 }),
    ];
    expect(computeGroundingConfidence(true, telemetry)).toBe('low');
  });
});
