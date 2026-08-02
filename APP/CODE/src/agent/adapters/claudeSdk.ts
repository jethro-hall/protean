import type { GatewayRequest } from '../../contracts/gateway.js';
import type { AssembledTurn } from '../../contracts/turn.js';
import type { LlmGateway } from '../../gateway/LlmGateway.js';
import type { LayerLogger } from '../../logging/logger.js';
import type { AgentCore, AgentEvent } from '../AgentCore.js';

/**
 * Claude-SDK-shaped AgentCore: presents the Claude Agent SDK's loop semantics
 * behind the AgentCore interface, with all provider I/O delegated to the
 * LlmGateway (AgentCore → Gateway → Claude Agent SDK). Carries the open-ended
 * tool policy + registry MCP bindings (any question → tools → answer).
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
        mcpServers: turn.mcpServers,
        datasetsDir: turn.datasetsDir,
        domainsDir: turn.domainsDir,
        runtimeConfigDir: turn.runtimeConfigDir,
        groundingConfig: turn.groundingConfig,
        knowledgeCollectionIds: turn.knowledgeCollectionsUsed,
        knowledgeCollectionWeights: turn.knowledgeCollectionWeights,
        ...(turn.effort !== undefined ? { effort: turn.effort } : {}),
        ...(turn.abortSignal !== undefined ? { abortSignal: turn.abortSignal } : {}),
        ...(turn.retrievalTelemetry !== undefined ? { retrievalTelemetry: turn.retrievalTelemetry } : {}),
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
          mcpServers: turn.mcpServers.map((server) => server.serverId),
          wiredTools: turn.wiredTools.map((tool) => tool.packToolId),
        },
      });
      yield* gateway.streamTurn(request);
    },
  };
}
