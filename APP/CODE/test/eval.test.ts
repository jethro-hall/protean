import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { loadEvalSet } from '../src/eval/evalSet.js';
import { scoreOutput } from '../src/eval/score.js';

describe('scoreOutput (deterministic scorer)', () => {
  it('scores full marks when all checks pass', () => {
    const result = scoreOutput('GET and POST are HTTP methods', {
      mustInclude: ['GET', 'POST'],
      mustNotInclude: ['DELETE'],
    });
    expect(result.score).toBe(1);
    expect(result.failures).toEqual([]);
  });

  it('is case-insensitive on inclusion checks', () => {
    const result = scoreOutput('the token count matters', { mustInclude: ['Token'], mustNotInclude: [] });
    expect(result.score).toBe(1);
  });

  it('fails missing, forbidden, and over-length checks with named failures', () => {
    const result = scoreOutput('x'.repeat(100), {
      mustInclude: ['absent'],
      mustNotInclude: ['x'],
      maxChars: 50,
    });
    expect(result.score).toBe(0);
    expect(result.failures).toHaveLength(3);
    expect(result.failures.join(' ')).toContain('missing');
    expect(result.failures.join(' ')).toContain('forbidden');
    expect(result.failures.join(' ')).toContain('too long');
  });

  it('scores 1 for an empty check set (nothing to fail)', () => {
    expect(scoreOutput('anything', { mustInclude: [], mustNotInclude: [] }).score).toBe(1);
  });
});

describe('baseline eval set on disk', () => {
  it('parses against the schema and targets a shipped domain', () => {
    const config = loadConfig();
    const set = loadEvalSet(config.paths.evalSetsDir, 'baseline');
    expect(set.items.length).toBeGreaterThanOrEqual(4);
    expect(set.domainId).toBe('generic');
  });
});
