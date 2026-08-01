import { z } from 'zod';
import type { ToolPolicy } from './agentLoop.js';

/**
 * Tool/Connector Registry contracts (Phase 5).
 * Domain packs declare logical tool ids; the registry maps them to built-in
 * SDK tools and/or MCP connectors. No vendor types here (Law 5).
 */

export const builtinConnectorSchema = z.object({
  kind: z.literal('builtin'),
  /** Claude Agent SDK built-in tool names (Read, Grep, Glob, …). */
  sdkTools: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
});

export const sdkMcpConnectorSchema = z.object({
  kind: z.literal('sdkMcp'),
  /** MCP server id → tools appear as mcp__<serverId>__<tool>. */
  serverId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  toolNames: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
});

/** External process MCP — must be fully configured or resolve fails loud (Law 1). */
export const stdioMcpConnectorSchema = z.object({
  kind: z.literal('stdioMcp'),
  serverId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  /** Env var NAMES whose values are copied into the child (never hardcoded secrets). */
  envFrom: z.array(z.string().min(1)).default([]),
  toolNames: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  enabled: z.boolean().default(false),
});

export const connectorEntrySchema = z.discriminatedUnion('kind', [
  builtinConnectorSchema,
  sdkMcpConnectorSchema,
  stdioMcpConnectorSchema,
]);
export type ConnectorEntry = z.infer<typeof connectorEntrySchema>;

export const connectorCatalogSchema = z.object({
  version: z.string().min(1),
  connectors: z.record(z.string(), connectorEntrySchema),
});
export type ConnectorCatalog = z.infer<typeof connectorCatalogSchema>;

/** One pack tool id after registry resolution. */
export interface WiredTool {
  packToolId: string;
  kind: ConnectorEntry['kind'];
  description: string;
  sdkTools: string[];
  /** Fully-qualified MCP tool names (mcp__server__tool), when any. */
  mcpToolNames: string[];
  serverId?: string;
}

/**
 * Provider-neutral MCP server binding carried on AssembledTurn / GatewayRequest.
 * The Claude adapter is the only place that materializes vendor MCP configs.
 */
export type ProteanMcpServerBinding =
  | {
      transport: 'sdk';
      serverId: string;
      /** Named handler factory id resolved in the Claude adapter. */
      handlerId: 'dataLake' | 'calendar' | 'knowledgeBase';
    }
  | {
      transport: 'stdio';
      serverId: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };

export interface ResolvedToolset {
  toolPolicy: ToolPolicy;
  wired: WiredTool[];
  mcpServers: ProteanMcpServerBinding[];
  /** Deterministic stamp for cache keys / lineage. */
  registryVersion: string;
}

/** Fully-qualified MCP tool name (SDK convention). */
export function mcpToolName(serverId: string, toolName: string): string {
  return `mcp__${serverId}__${toolName}`;
}
