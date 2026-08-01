import { testAnthropicConnection, listAnthropicModels } from './anthropicAdmin.js';
import { testBedrockConnection, listBedrockModels } from './bedrockAdmin.js';
import { testOpenAiCompatibleConnection, listOpenAiCompatibleModels } from './openAiCompatibleAdmin.js';
import type { ProviderAdminConfig, ProviderAdminResult } from './types.js';

export async function testProviderConnection(config: ProviderAdminConfig): Promise<ProviderAdminResult> {
  switch (config.type) {
    case 'anthropic':
      return testAnthropicConnection(config);
    case 'bedrock':
      return testBedrockConnection(config);
    case 'openai-compatible':
      return testOpenAiCompatibleConnection(config);
  }
}

export async function listProviderModels(config: ProviderAdminConfig): Promise<ProviderAdminResult> {
  switch (config.type) {
    case 'anthropic':
      return listAnthropicModels(config);
    case 'bedrock':
      return listBedrockModels(config);
    case 'openai-compatible':
      return listOpenAiCompatibleModels(config);
  }
}
