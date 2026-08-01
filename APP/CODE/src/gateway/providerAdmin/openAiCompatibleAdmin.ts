import { fetchJson, type OpenAiCompatibleProviderConfig, type ProviderAdminResult } from './types.js';

export async function listOpenAiCompatibleModels(
  config: OpenAiCompatibleProviderConfig,
): Promise<ProviderAdminResult> {
  const log: string[] = [];
  const base = config.baseUrl.replace(/\/+$/, '');
  const result = await fetchJson(`${base}/models`, { Authorization: `Bearer ${config.apiKey}` }, log);
  if (!result.ok) {
    return { ok: false, message: result.message, log };
  }
  const body = result.body as { data?: Array<{ id?: string }> };
  const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  if (models.length === 0) {
    return { ok: false, message: `${base} returned an empty model list -- unexpected for a valid key.`, log };
  }
  return { ok: true, message: `Found ${models.length} model(s).`, models, log };
}

export async function testOpenAiCompatibleConnection(
  config: OpenAiCompatibleProviderConfig,
): Promise<ProviderAdminResult> {
  const result = await listOpenAiCompatibleModels(config);
  return result.ok
    ? { ...result, message: `Connected -- ${result.message}` }
    : result;
}
