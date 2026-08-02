import { GROUNDING_MIN_HIT_RATIO } from '../config/defaults.js';
import type { RetrievalTelemetryEntry } from '../contracts/knowledge.js';

export type GroundingConfidence = 'low' | 'none';

/**
 * Deterministic, code-computed grounding-confidence gate (Law 4 — never
 * LLM-self-reported). Only fires when `query_knowledge_base` was actually
 * called this turn: a grounded turn the model answered correctly from the
 * Tier-0 digest alone, with no tool call, is NOT a low-confidence signal —
 * flagging every digest-only answer would bury the real signal in noise.
 * The genuine risk case this catches is the model reaching for on-demand
 * retrieval (digest wasn't enough) and coming back with thin or no evidence.
 */
export function computeGroundingConfidence(
  grounded: boolean,
  retrievalTelemetry: readonly RetrievalTelemetryEntry[],
): GroundingConfidence | undefined {
  if (!grounded || retrievalTelemetry.length === 0) return undefined;

  const best = retrievalTelemetry.reduce((a, b) => (b.hitCount > a.hitCount ? b : a));
  if (best.hitCount === 0) return 'none';
  if (best.hitCount < Math.ceil(best.requestedLimit * GROUNDING_MIN_HIT_RATIO)) return 'low';
  return undefined;
}
