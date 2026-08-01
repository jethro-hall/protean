/**
 * Client-side token estimate for the composer, shown live while typing.
 * A chars/4 heuristic (the same order-of-magnitude approximation most editors
 * use client-side) -- always prefixed with "~" wherever it's rendered, never
 * presented as an exact count. The real, exact figure comes back per-message
 * from the provider once a turn completes (see TurnDone.usage in lib/api.ts).
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimateTokens(text: string): number {
  if (text.trim() === '') return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}
