import type { GatewayRequest } from '../../contracts/gateway.js';
import type { AssembledTurn } from '../../contracts/turn.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { AgentCore, AgentEvent } from '../AgentCore.js';

/**
 * Claude-SDK-shaped AgentCore: presents the Claude Agent SDK's loop semantics
 * behind the AgentCore interface, with all provider I/O delegated to the
 * LlmGateway (AgentCore → Gateway → Claude Agent SDK). Carries the open-ended
 * tool policy (any question → tools → answer); MCP connectors arrive later.
 */
export function createClaudeSdkAgentCore(gateway: LlmGateway, log: LayerLogger): AgentCore {
  return {
    name: 'claude-sdk',
    async *runTurn(turn: AssembledTurn): AsyncIterable<AgentEvent> {
      const request: GatewayRequest = {
        turnId: turn.turnId,
        model: turn.model,
        systemPrompt: {
          staticPrefix: turn.systemPromptStatic,
          dynamicSuffix: turn.systemPromptDynamic,
        },
        messages: turn.messages,
        toolPolicy: turn.toolPolicy,
        workspaceDir: turn.workspaceDir,
        ...(turn.abortSignal !== undefined ? { abortSignal: turn.abortSignal } : {}),
      };
      log.info('agent.turn.start', `Agent turn via ${gateway.provider} gateway, tier ${turn.tier}`, {
        turnId: turn.turnId,
        sessionId: turn.sessionId,
        data: {
          model: turn.model,
          domainId: turn.domainId,
          toolsetVersion: turn.toolsetVersion,
          maxTurns: turn.toolPolicy.maxTurns,
          tools: turn.toolPolicy.availableTools,
        },
      });
      yield* gateway.streamTurn(request);
    },
  };
}
