import type { GatewayEvent, GatewayRequest } from '../contracts/gateway.js';

/**
 * Provider-agnostic LLM gateway (Law 5). The app speaks this ONE internal
 * protocol; each provider lives behind it in adapters/<provider>.ts.
 */
export interface LlmGateway {
  /** Which adapter is serving (for lineage logs), e.g. "claude". */
  readonly provider: string;
  /** Stream a model response. Must emit zero+ 'text' events then exactly one 'done' or 'error'. */
  streamTurn(request: GatewayRequest): AsyncIterable<GatewayEvent>;
}
