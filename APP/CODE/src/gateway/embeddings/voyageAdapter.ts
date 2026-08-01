/**
 * Voyage AI adapter for EmbeddingGateway (Phase N) -- the ONLY file that may
 * import/shape a Voyage-specific request. Plain fetch against Voyage's REST
 * API, no vendor SDK (same no-vendor-SDK pattern as
 * gateway/adapters/customProvider.ts) -- swappable to another embedding
 * provider later without touching callers (Law 5).
 *
 * API surface verified live against https://docs.voyageai.com/reference/embeddings-api
 * before writing this file (2026-08-01): POST /v1/embeddings, Bearer auth,
 * {input, model, input_type?} request, {data:[{embedding,index}], model, usage:{total_tokens}} response.
 */
import type { EmbeddingRequest, EmbeddingResult } from '../../contracts/embedding.js';
import type { EmbeddingGateway } from './EmbeddingGateway.js';

const VOYAGE_MAX_BATCH = 1000;

interface VoyageResponseBody {
  data?: Array<{ embedding: number[]; index: number }>;
  model?: string;
  usage?: { total_tokens?: number };
  error?: { message?: string };
  detail?: string;
}

export function createVoyageEmbeddingGateway(apiKey: string, model: string): EmbeddingGateway {
  return {
    provider: 'voyage',
    async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
      if (request.texts.length === 0) {
        throw new Error('embed() called with zero texts -- nothing to embed.');
      }
      if (request.texts.length > VOYAGE_MAX_BATCH) {
        throw new Error(
          `embed() called with ${request.texts.length} texts -- Voyage's API caps a single batch at ${VOYAGE_MAX_BATCH}. Split into smaller batches.`,
        );
      }
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          input: request.texts,
          model,
          ...(request.inputType !== undefined ? { input_type: request.inputType } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as VoyageResponseBody;
      if (!res.ok) {
        const detail = body.error?.message ?? body.detail ?? res.statusText;
        throw new Error(`Voyage embeddings ${res.status}: ${detail}`);
      }
      if (body.data === undefined || body.model === undefined || body.usage?.total_tokens === undefined) {
        throw new Error(
          `Voyage embeddings returned an unexpected shape (missing data/model/usage) -- got keys: ${Object.keys(body).join(', ')}`,
        );
      }
      const embeddings = [...body.data]
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.embedding);
      return { embeddings, model: body.model, totalTokens: body.usage.total_tokens };
    },
  };
}
