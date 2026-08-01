import type { GatewayRequest } from '../../contracts/gateway.js';
import type { AssembledTurn } from '../../contracts/turn.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { AgentCore, AgentEvent } from '../AgentCore.js';

/**
 * Passthrough AgentCore for a custom (Phase 6 Providers & Models) gateway --
 * `AgentEvent` and `GatewayEvent` are literally the same type, so this is
 * exactly "call the gateway directly" with no tool loop. Custom providers
 * (OpenAI-compatible / a saved Bedrock/Anthropic connection) don't go through
 * the Claude Agent SDK at all: no tool use, no MCP -- an honest, simpler,
 * non-agentic response path, not a degraded version of the built-in one.
 */
export function createRawGatewayAgentCore(gateway: LlmGateway): AgentCore {
  return {
    name: `raw-${gateway.provider}`,
    async *runTurn(turn: AssembledTurn): AsyncIterable<AgentEvent> {
      const systemPrompt =
        turn.systemPromptStatic !== '' || turn.systemPromptDynamic !== ''
          ? { staticPrefix: turn.systemPromptStatic, dynamicSuffix: turn.systemPromptDynamic }
          : turn.systemPrompt;
      const request: GatewayRequest = {
        turnId: turn.turnId,
        model: turn.model,
        systemPrompt,
        messages: turn.messages,
        ...(turn.abortSignal !== undefined ? { abortSignal: turn.abortSignal } : {}),
      };
      yield* gateway.streamTurn(request);
    },
  };
}
