import {
  mcpToolName,
  type ConnectorCatalog,
  type ConnectorEntry,
  type ProteanMcpServerBinding,
  type ResolvedToolset,
  type WiredTool,
} from '../contracts/connectors.js';
import type { ToolPolicy } from '../contracts/agentLoop.js';
import { toolsetVersionFromPolicy } from '../config/defaults.js';

/**
 * Tool/Connector Registry — maps Domain Pack tool ids → live bindings.
 * Pure resolution (Law 4). Vendor MCP construction happens in the Claude adapter.
 */

const SDK_MCP_HANDLER_BY_SERVER: Record<string, 'dataLake' | 'calendar' | 'knowledgeBase'> = {
  'protean-datalake': 'dataLake',
  'protean-calendar': 'calendar',
  'protean-knowledgebase': 'knowledgeBase',
};

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function envBindings(envFrom: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of envFrom) {
    const value = process.env[name];
    if (value === undefined || value === '') {
      throw new Error(
        `Connector env "${name}" is unset — configure it in .env (never commit secrets)`,
      );
    }
    env[name] = value;
  }
  return env;
}

function wireEntry(packToolId: string, entry: ConnectorEntry): {
  wired: WiredTool;
  binding: ProteanMcpServerBinding | null;
} {
  if (entry.kind === 'builtin') {
    return {
      wired: {
        packToolId,
        kind: entry.kind,
        description: entry.description,
        sdkTools: [...entry.sdkTools],
        mcpToolNames: [],
      },
      binding: null,
    };
  }

  if (entry.kind === 'sdkMcp') {
    const handlerId = SDK_MCP_HANDLER_BY_SERVER[entry.serverId];
    if (handlerId === undefined) {
      throw new Error(
        `sdkMcp connector "${packToolId}" serverId "${entry.serverId}" has no in-process handler ` +
          `(known: ${Object.keys(SDK_MCP_HANDLER_BY_SERVER).join(', ')})`,
      );
    }
    return {
      wired: {
        packToolId,
        kind: entry.kind,
        description: entry.description,
        sdkTools: [],
        mcpToolNames: entry.toolNames.map((name) => mcpToolName(entry.serverId, name)),
        serverId: entry.serverId,
      },
      binding: { transport: 'sdk', serverId: entry.serverId, handlerId },
    };
  }

  if (!entry.enabled) {
    throw new Error(
      `Connector "${packToolId}" (stdioMcp/${entry.serverId}) is not enabled — ` +
        'set enabled:true in connectors.catalog.json and provide envFrom secrets before use',
    );
  }
  return {
    wired: {
      packToolId,
      kind: entry.kind,
      description: entry.description,
      sdkTools: [],
      mcpToolNames: entry.toolNames.map((name) => mcpToolName(entry.serverId, name)),
      serverId: entry.serverId,
    },
    binding: {
      transport: 'stdio',
      serverId: entry.serverId,
      command: entry.command,
      args: [...entry.args],
      env: envBindings(entry.envFrom),
    },
  };
}

export interface ResolveToolsetInput {
  /** Domain pack `tools` ids (declarations). Empty → agent-loop substrate only. */
  packToolIds: readonly string[];
  /** Runtime ceiling from PROTEAN_AGENT_* (Bash still refused at loadConfig). */
  agentLoop: ToolPolicy;
  catalog: ConnectorCatalog;
}

/**
 * Resolve pack tool declarations against the connector catalog into a live toolset.
 * Unknown pack tool ids fail loud (Law 1). Built-ins must sit inside the agent-loop ceiling.
 */
export function resolveToolset(input: ResolveToolsetInput): ResolvedToolset {
  const { packToolIds, agentLoop, catalog } = input;
  const ceiling = new Set(agentLoop.availableTools);
  const wired: WiredTool[] = [];
  const bindingsByServer = new Map<string, ProteanMcpServerBinding>();
  const sdkTools = new Set<string>();
  const mcpTools = new Set<string>();

  if (packToolIds.length === 0) {
    for (const name of agentLoop.availableTools) sdkTools.add(name);
  } else {
    for (const packToolId of packToolIds) {
      const entry = catalog.connectors[packToolId];
      if (entry === undefined) {
        throw new Error(
          `Domain pack tool "${packToolId}" is not in the connector registry ` +
            `(catalog ${catalog.version}). Add it to connectors.catalog.json.`,
        );
      }
      const { wired: wire, binding } = wireEntry(packToolId, entry);
      wired.push(wire);
      for (const name of wire.sdkTools) {
        if (!ceiling.has(name)) {
          throw new Error(
            `Connector "${packToolId}" needs SDK tool "${name}" but PROTEAN_AGENT_AVAILABLE_TOOLS ` +
              `ceiling is [${[...ceiling].join(', ')}]`,
          );
        }
        sdkTools.add(name);
      }
      for (const name of wire.mcpToolNames) mcpTools.add(name);
      if (binding !== null) {
        const existing = bindingsByServer.get(binding.serverId);
        if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(binding)) {
          throw new Error(`Conflicting MCP bindings for server "${binding.serverId}"`);
        }
        bindingsByServer.set(binding.serverId, binding);
      }
    }
  }

  const availableTools = uniqueSorted([...sdkTools, ...mcpTools]);
  const allowedFromCeiling = agentLoop.allowedTools.filter((name) => sdkTools.has(name));
  const allowedTools = uniqueSorted([...allowedFromCeiling, ...mcpTools]);

  const toolPolicy: ToolPolicy = {
    availableTools,
    allowedTools,
    maxTurns: agentLoop.maxTurns,
    permissionMode: agentLoop.permissionMode,
  };

  return {
    toolPolicy,
    wired,
    mcpServers: [...bindingsByServer.values()].sort((a, b) =>
      a.serverId.localeCompare(b.serverId),
    ),
    registryVersion: `${catalog.version}+${toolsetVersionFromPolicy(toolPolicy)}`,
  };
}
