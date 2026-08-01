import { fetchJson, type BedrockProviderConfig, type ProviderAdminResult } from './types.js';

/**
 * Uses Bedrock's bearer-token API-key auth (the same auth mode this app's
 * gateway already uses via AWS_BEARER_TOKEN_BEDROCK -- see config/defaults.ts)
 * rather than full IAM/SigV4 signing, so a plain fetch is enough here: no AWS
 * SDK dependency needed for this admin-only call.
 */
export async function listBedrockModels(config: BedrockProviderConfig): Promise<ProviderAdminResult> {
  const log: string[] = [];
  const url = `https://bedrock.${config.awsRegion}.amazonaws.com/foundation-models?byOutputModality=TEXT`;
  const result = await fetchJson(url, { Authorization: `Bearer ${config.bearerToken}` }, log);
  if (!result.ok) {
    return { ok: false, message: result.message, log };
  }
  const body = result.body as { modelSummaries?: Array<{ modelId?: string }> };
  const models = (body.modelSummaries ?? [])
    .map((m) => m.modelId)
    .filter((id): id is string => typeof id === 'string');
  if (models.length === 0) {
    return { ok: false, message: 'Bedrock returned an empty model list -- unexpected for a valid key/region.', log };
  }
  return { ok: true, message: `Found ${models.length} model(s) in ${config.awsRegion}.`, models, log };
}

export async function testBedrockConnection(config: BedrockProviderConfig): Promise<ProviderAdminResult> {
  const result = await listBedrockModels(config);
  return result.ok
    ? { ...result, message: `Connected -- ${result.message}` }
    : result;
}
