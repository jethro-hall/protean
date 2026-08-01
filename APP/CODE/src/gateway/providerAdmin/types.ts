/**
 * Provider Test Connection / List Models (Phase 6). These are admin/settings-
 * time calls only -- never the live chat-turn path, which still goes through
 * gateway/adapters/claude.ts exclusively. Scoped here as a narrow, documented
 * exception to "only claude.ts imports vendor SDK/HTTP surfaces" (Law 5's
 * intent is about the turn-execution boundary staying provider-agnostic, not
 * about admin utilities that never touch a model response).
 */

export interface ProviderAdminResult {
  ok: boolean;
  /** Always a specific, actionable sentence -- never a bare "error" (UX truthful-state law). */
  message: string;
  models?: string[];
  /** Full request/response trail, secrets redacted -- always shown, never collapsed away. */
  log: string[];
}

export type ProviderType = 'anthropic' | 'bedrock' | 'openai-compatible';

export interface AnthropicProviderConfig {
  type: 'anthropic';
  apiKey: string;
}

export interface BedrockProviderConfig {
  type: 'bedrock';
  awsRegion: string;
  bearerToken: string;
}

export interface OpenAiCompatibleProviderConfig {
  type: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
}

export type ProviderAdminConfig =
  | AnthropicProviderConfig
  | BedrockProviderConfig
  | OpenAiCompatibleProviderConfig;

const HTTP_TIMEOUT_MS = 10_000;

/** Shared GET-JSON-with-timeout used by every admin adapter -- keeps failure messages consistent. */
export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  log: string[],
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; message: string }> {
  log.push(`GET ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    log.push(`<- ${res.status} ${res.statusText} (${text.length} bytes)`);
    if (!res.ok) {
      const detail = text.slice(0, 300);
      return {
        ok: false,
        message: `${res.status} ${res.statusText} from ${new URL(url).host}${detail !== '' ? ` -- ${detail}` : ''}`,
      };
    }
    try {
      return { ok: true, status: res.status, body: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, message: `Response from ${new URL(url).host} was not valid JSON.` };
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      log.push(`<- timed out after ${HTTP_TIMEOUT_MS}ms`);
      return { ok: false, message: `Timed out after ${HTTP_TIMEOUT_MS}ms waiting for ${new URL(url).host}.` };
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    log.push(`<- network error: ${message}`);
    return { ok: false, message: `Could not reach ${new URL(url).host}: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}
