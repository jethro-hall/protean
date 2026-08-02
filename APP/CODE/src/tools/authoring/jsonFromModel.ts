/** Strips an optional markdown code fence a model sometimes wraps JSON in, despite being told not to. */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
