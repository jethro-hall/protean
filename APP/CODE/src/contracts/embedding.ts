/**
 * Provider-agnostic embedding contract (Law 5, Phase N). Mirrors TokenUsage's
 * shape/lineage conventions so embedding calls are measured like every other
 * provider call (Law 6) -- never assumed free.
 */
export interface EmbeddingRequest {
  /** Text to embed. Voyage/most providers cap batch size -- caller chunks accordingly. */
  texts: readonly string[];
  /**
   * Asymmetric embedding hint: 'document' for content being indexed (knowledge
   * chunks), 'query' for a search query -- improves retrieval quality per the
   * provider's own guidance. Omit for a provider with no such distinction.
   */
  inputType?: 'query' | 'document';
}

export interface EmbeddingResult {
  embeddings: readonly (readonly number[])[];
  model: string;
  totalTokens: number;
}
