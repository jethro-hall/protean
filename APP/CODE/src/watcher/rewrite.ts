import type { GatewayEvent } from '../contracts/gateway.js';
import type { AssembledTurn } from '../contracts/turn.js';
import type { LlmGateway } from '../gateway/LlmGateway.js';
import type { LayerLogger } from '../logging/logger.js';
import { estimateTokens } from './budget.js';

/**
 * Watcher step 4 — OPTIMISE, conditionally (ARCHITECTURE §3). The gate is pure
 * code; only when it fires does a small fast model rewrite the prompt, and that
 * call is itself measured and logged. If the A/B eval doesn't prove it pays for
 * itself, it stays off (config `rewriteEnabled`, default false).
 */

export interface RewriteDecision {
  rewrite: boolean;
  reason: string;
}

/** Deterministic gate: rewrite only when the input is genuinely bloated. */
export function shouldRewriteTurn(turn: AssembledTurn, bloatTokenThreshold: number): RewriteDecision {
  const inputTokens = estimateTokens(turn.input);
  if (inputTokens > bloatTokenThreshold) {
    return {
      rewrite: true,
      reason: `input ~${inputTokens} tokens exceeds the ${bloatTokenThreshold}-token bloat threshold`,
    };
  }
  return { rewrite: false, reason: 'deterministic path — input within bloat threshold' };
}

/** The rewrite instruction is a protocol constant of the Watcher, not a domain fact. */
export const REWRITE_SYSTEM_PROMPT =
  'You compress prompts. Rewrite the user text to be as short as possible while preserving every ' +
  'requirement, fact, name, and constraint. Output ONLY the rewritten text — no preamble.';

export interface RewriteResult {
  text: string;
  rewriteMs: number;
}

/** Run the Tier-1 rewrite through the gateway; failure falls back to the original, logged. */
export async function rewriteTurnInput(
  gateway: LlmGateway,
  turn: AssembledTurn,
  fastModel: string,
  log: LayerLogger,
): Promise<RewriteResult> {
  const started = performance.now();
  let rewritten = '';
  let failed: string | null = null;
  const events: AsyncIterable<GatewayEvent> = gateway.streamTurn({
    turnId: `${turn.turnId}-rewrite`,
    model: fastModel,
    systemPrompt: REWRITE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: turn.input }],
  });
  for await (const event of events) {
    if (event.type === 'text') rewritten += event.text;
    if (event.type === 'error') failed = event.message;
  }
  const rewriteMs = Number((performance.now() - started).toFixed(2));
  if (failed !== null || rewritten.trim() === '') {
    // Designed, surfaced fallback (not a silent one): the original input proceeds.
    log.warn(
      'watcher.rewrite.fallback',
      `Rewrite failed (${failed ?? 'empty output'}) after ${rewriteMs} ms — using original input`,
      { turnId: turn.turnId },
    );
    return { text: turn.input, rewriteMs };
  }
  log.info(
    'watcher.rewrite.done',
    `Rewrite compressed input ${turn.input.length} → ${rewritten.trim().length} chars in ${rewriteMs} ms`,
    { turnId: turn.turnId },
  );
  return { text: rewritten.trim(), rewriteMs };
}
