/**
 * Grounded Knowledge v2 (Phases M-Q) connection config -- plain data, not
 * live service instances, so it can cross the GatewayRequest boundary the
 * same way abortSignal already does (Law 5: adapters construct their own
 * vendor clients from config, never receive pre-built ones from outside
 * their own layer). Canonical shape shared by config/loadConfig.ts's
 * ProteanConfig.grounding and contracts/turn.ts/gateway.ts's threading.
 */
export interface PgConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface GroundingConfig {
  pg: PgConnectionConfig | undefined;
  voyageApiKey: string | undefined;
  embeddingModel: string;
}
