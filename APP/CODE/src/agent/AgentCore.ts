import type { GatewayEvent } from '../contracts/gateway.js';
import type { AssembledTurn } from '../contracts/turn.js';

/**
 * Events the agent loop emits while running a turn. Phase 0 = the gateway
 * events passed through; tool/subagent events extend this union in the
 * tool-registry phase.
 */
export type AgentEvent = GatewayEvent;

/**
 * The agentic loop behind an interface so the engine never depends on a vendor
 * loop directly (Law 5). First implementation: adapters/claudeSdk.ts.
 */
export interface AgentCore {
  readonly name: string;
  runTurn(turn: AssembledTurn): AsyncIterable<AgentEvent>;
}
