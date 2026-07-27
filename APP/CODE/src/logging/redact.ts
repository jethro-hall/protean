/**
 * Secret redaction at the logging boundary — the one security rule that holds
 * during the POC. Any env value whose NAME looks secret is scrubbed from output.
 */
const SECRET_NAME_PATTERN = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;
const REDACTED = '[REDACTED]';
const MIN_SECRET_LENGTH = 6; // shorter values would redact innocent substrings

let cachedSecrets: string[] | null = null;

function collectSecretValues(): string[] {
  if (cachedSecrets !== null) return cachedSecrets;
  cachedSecrets = Object.entries(process.env)
    .filter(([name, value]) => SECRET_NAME_PATTERN.test(name) && (value ?? '').length >= MIN_SECRET_LENGTH)
    .map(([, value]) => value as string);
  return cachedSecrets;
}

/** Test seam: forget the memoised env snapshot. */
export function resetSecretCache(): void {
  cachedSecrets = null;
}

export function redactString(text: string): string {
  let out = text;
  for (const secret of collectSecretValues()) {
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** Deep-redact any JSON-serialisable value. */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactValue(item)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactValue(entry);
    }
    return out as T;
  }
  return value;
}
