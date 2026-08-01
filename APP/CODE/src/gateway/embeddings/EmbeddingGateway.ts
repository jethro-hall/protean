import type { EmbeddingRequest, EmbeddingResult } from '../../contracts/embedding.js';

/**
 * Provider-agnostic embedding gateway (Law 5). The app speaks this ONE
 * internal protocol; each provider lives behind it in embeddings/<provider>Adapter.ts.
 * Same shape as LlmGateway -- one method, one adapter per vendor.
 */
export interface EmbeddingGateway {
  readonly provider: string;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
