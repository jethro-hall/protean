/**
 * Claude-adapter-only MCP materialization (Law 5).
 * Builds vendor mcpServers from Protean bindings + deterministic handlers.
 */
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ProteanMcpServerBinding } from '../../contracts/connectors.js';
import { listAppointments } from '../../tools/handlers/calendar.js';
import { listDatasets, summarizeCsv } from '../../tools/handlers/dataLake.js';
import { queryKnowledgeBase } from '../../tools/handlers/knowledgeBase.js';

function jsonResult(payload: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function buildDataLakeServer(datasetsDir: string): McpServerConfig {
  return createSdkMcpServer({
    name: 'protean-datalake',
    version: '0.1.0',
    alwaysLoad: true,
    instructions:
      'Deterministic CSV dataset tools. Prefer list_datasets then summarize_csv. ' +
      'Never invent figures — only report tool JSON.',
    tools: [
      tool(
        'list_datasets',
        'List CSV datasets available under the Protean datasets root.',
        {},
        async () => {
          try {
            return jsonResult({ datasets: listDatasets(datasetsDir) });
          } catch (cause) {
            return errorResult(cause instanceof Error ? cause.message : String(cause));
          }
        },
      ),
      tool(
        'summarize_csv',
        'Summarise a CSV dataset: headers, row count, numeric column sums, sample rows.',
        {
          relativePath: z
            .string()
            .describe('Path relative to datasets root, e.g. finance/rd-ledger-ry2024.csv'),
          sampleLimit: z.number().int().positive().max(50).optional(),
        },
        async (args) => {
          try {
            return jsonResult(
              summarizeCsv(datasetsDir, args.relativePath, args.sampleLimit ?? 8),
            );
          } catch (cause) {
            return errorResult(cause instanceof Error ? cause.message : String(cause));
          }
        },
      ),
    ],
  });
}

function buildCalendarServer(datasetsDir: string): McpServerConfig {
  return createSdkMcpServer({
    name: 'protean-calendar',
    version: '0.1.0',
    alwaysLoad: true,
    instructions:
      'Read-only clinic calendar fixture. Never invent appointments or patient data.',
    tools: [
      tool(
        'list_appointments',
        'List clinic appointments from the medical calendar dataset (optional day filter YYYY-MM-DD).',
        {
          day: z.string().optional().describe('Optional ISO date YYYY-MM-DD'),
          relativePath: z
            .string()
            .optional()
            .describe('Optional path under datasets; default medical/clinic-calendar.json'),
        },
        async (args) => {
          try {
            return jsonResult(
              listAppointments(
                datasetsDir,
                args.relativePath ?? 'medical/clinic-calendar.json',
                args.day,
              ),
            );
          } catch (cause) {
            return errorResult(cause instanceof Error ? cause.message : String(cause));
          }
        },
      ),
    ],
  });
}

function buildKnowledgeBaseServer(
  domainsDir: string,
  collectionIds: readonly string[],
  weights: Record<string, number>,
  runtimeConfigDir: string | undefined,
): McpServerConfig {
  return createSdkMcpServer({
    name: 'protean-knowledgebase',
    version: '0.1.0',
    alwaysLoad: true,
    instructions:
      'Deterministic keyword retrieval over curated domain knowledge collections (Phase 6 ' +
      'grounded-knowledge POC). The digest already in context is a compressed pointer — call ' +
      'this for exact wording, thresholds, or anything the digest does not cover. Never invent ' +
      'a citation; only report what this tool returns.',
    tools: [
      tool(
        'query_knowledge_base',
        'Search the grounded knowledge collections for chunks relevant to a query. Returns ' +
          'text with source title/URL/capture date for citation.',
        {
          query: z.string().min(1).describe('What to look up, in plain language'),
          limit: z.number().int().positive().max(10).optional(),
        },
        async (args) => {
          try {
            return jsonResult({
              hits: queryKnowledgeBase(domainsDir, collectionIds, args.query, args.limit ?? 5, weights, runtimeConfigDir),
            });
          } catch (cause) {
            return errorResult(cause instanceof Error ? cause.message : String(cause));
          }
        },
      ),
    ],
  });
}

/** Map Protean MCP bindings → Claude Agent SDK mcpServers option. */
export function materializeMcpServers(
  bindings: readonly ProteanMcpServerBinding[],
  datasetsDir: string,
  domainsDir?: string,
  knowledgeCollectionIds?: string[],
  knowledgeCollectionWeights?: Record<string, number>,
  runtimeConfigDir?: string,
): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  for (const binding of bindings) {
    if (binding.transport === 'stdio') {
      out[binding.serverId] = {
        type: 'stdio',
        command: binding.command,
        args: binding.args,
        env: binding.env,
        alwaysLoad: true,
      };
      continue;
    }
    if (binding.handlerId === 'dataLake') {
      out[binding.serverId] = buildDataLakeServer(datasetsDir);
      continue;
    }
    if (binding.handlerId === 'calendar') {
      out[binding.serverId] = buildCalendarServer(datasetsDir);
      continue;
    }
    if (binding.handlerId === 'knowledgeBase') {
      if (domainsDir === undefined || domainsDir === '') {
        throw new Error('GatewayRequest.domainsDir is required when a knowledgeBase MCP server is bound');
      }
      out[binding.serverId] = buildKnowledgeBaseServer(
        domainsDir,
        knowledgeCollectionIds ?? [],
        knowledgeCollectionWeights ?? {},
        runtimeConfigDir,
      );
      continue;
    }
    const _exhaustive: never = binding.handlerId;
    throw new Error(`Unhandled sdk MCP handler: ${String(_exhaustive)}`);
  }
  return out;
}
