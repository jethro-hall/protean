import { fetchJson, type AnthropicProviderConfig, type ProviderAdminResult } from './types.js';

const ANTHROPIC_API_VERSION = '2023-06-01';

export async function listAnthropicModels(config: AnthropicProviderConfig): Promise<ProviderAdminResult> {
  const log: string[] = [];
  const result = await fetchJson(
    'https://api.anthropic.com/v1/models',
    { 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_API_VERSION },
    log,
  );
  if (!result.ok) {
    return { ok: false, message: result.message, log };
  }
  const body = result.body as { data?: Array<{ id?: string }> };
  const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  if (models.length === 0) {
    return { ok: false, message: 'Anthropic returned an empty model list -- unexpected for a valid key.', log };
  }
  return { ok: true, message: `Found ${models.length} model(s).`, models, log };
}

export async function testAnthropicConnection(config: AnthropicProviderConfig): Promise<ProviderAdminResult> {
  const result = await listAnthropicModels(config);
  return result.ok
    ? { ...result, message: `Connected -- ${result.message}` }
    : result;
}
