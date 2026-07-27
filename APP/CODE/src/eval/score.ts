import type { EvalChecks } from './evalSet.js';

export interface ScoreResult {
  score: number;
  passed: number;
  total: number;
  failures: string[];
}

/** Deterministic scoring: each check is worth one point; score is the pass fraction. */
export function scoreOutput(output: string, checks: EvalChecks): ScoreResult {
  const failures: string[] = [];
  let total = 0;
  const lowerOutput = output.toLowerCase();

  for (const needle of checks.mustInclude) {
    total += 1;
    if (!lowerOutput.includes(needle.toLowerCase())) failures.push(`missing: "${needle}"`);
  }
  for (const needle of checks.mustNotInclude) {
    total += 1;
    if (lowerOutput.includes(needle.toLowerCase())) failures.push(`forbidden present: "${needle}"`);
  }
  if (checks.maxChars !== undefined) {
    total += 1;
    if (output.length > checks.maxChars) {
      failures.push(`too long: ${output.length} > ${checks.maxChars} chars`);
    }
  }

  const passed = total - failures.length;
  return { score: total === 0 ? 1 : passed / total, passed, total, failures };
}
