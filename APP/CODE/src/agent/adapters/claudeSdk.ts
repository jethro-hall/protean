import type { GatewayRequest } from '../../contracts/gateway.js';
import type { AssembledTurn } from '../../contracts/turn.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { AgentCore, AgentEvent } from '../AgentCore.js';

/**
 * Claude-SDK-shaped AgentCore: presents the Claude Agent SDK's loop semantics
 * behind the AgentCore interface, with all provider I/O delegated to the
 * LlmGateway (AgentCore → Gateway → Claude Agent SDK). Phase 0 runs the
 * single-answer path; tools/subagents plug in here in the tool-registry phase.
 */
export function createClaudeSdkAgentCore(gateway: LlmGateway, log: LayerLogger): AgentCore {
  return {
    name: 'claude-sdk',
    async *runTurn(turn: AssembledTurn): AsyncIterable<AgentEvent> {
      const request: GatewayRequest = {
        turnId: turn.turnId,
        model: turn.model,
        systemPrompt: turn.systemPrompt,
        messages: turn.messages,
      };
      log.info('agent.turn.start', `Agent turn via ${gateway.provider} gateway, tier ${turn.tier}`, {
        turnId: turn.turnId,
        sessionId: turn.sessionId,
        data: { model: turn.model, domainId: turn.domainId },
      });
      yield* gateway.streamTurn(request);
    },
  };
}
