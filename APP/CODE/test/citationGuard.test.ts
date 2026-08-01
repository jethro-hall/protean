import { describe, expect, it } from 'vitest';
import { findUnverifiedProvenanceClaims } from '../src/watcher/citationGuard.js';

describe('findUnverifiedProvenanceClaims', () => {
  it('flags the exact fabricated phrase found in the grounded-knowledge POC (2026-08-01)', () => {
    const output =
      '**[FACT]** The threshold is $20,000. Source: ATO — R&D Tax Incentive, ' +
      'from official knowledge base.';
    const hits = findUnverifiedProvenanceClaims(output, []);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => /official knowledge base/i.test(hit))).toBe(true);
  });

  it('does not flag ordinary text with no provenance claim', () => {
    const output = 'The threshold is $20,000 per year, based on general R&D tax knowledge.';
    expect(findUnverifiedProvenanceClaims(output, [])).toEqual([]);
  });

  it('does not flag a provenance claim when the corroborating tool actually ran', () => {
    const output = 'Source: retrieved from official knowledge base, see citation above.';
    expect(findUnverifiedProvenanceClaims(output, ['query_knowledge_base'])).toEqual([]);
  });

  it('regression: unrelated tool calls do NOT corroborate a knowledge-base-specific claim', () => {
    // The exact second-order fabrication found live: after the prompt fix, the model
    // stopped saying "official knowledge base" and said this instead, while only
    // Grep/Glob/Read ran (file search tools, not the knowledge base).
    const output = 'This is documented in the same ATO knowledge base sourced in the codebase.';
    const hits = findUnverifiedProvenanceClaims(output, ['Grep', 'Glob', 'Read']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('catches other provenance-claim phrasings, not just the one exact bug string', () => {
    expect(findUnverifiedProvenanceClaims('I looked up the current rate for you.', [])).not.toEqual([]);
    expect(
      findUnverifiedProvenanceClaims('This was retrieved from the official register.', []),
    ).not.toEqual([]);
    expect(
      findUnverifiedProvenanceClaims('According to the official database, this is correct.', []),
    ).not.toEqual([]);
  });
});
