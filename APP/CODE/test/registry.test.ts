import { describe, expect, it } from 'vitest';
import type { ToolPolicy } from '../src/contracts/agentLoop.js';
import { loadConnectorCatalog } from '../src/config/loadConnectors.js';
import { resolveToolset } from '../src/tools/registry.js';

const agentLoop: ToolPolicy = {
  availableTools: ['Read', 'Grep', 'Glob'],
  allowedTools: ['Read', 'Grep', 'Glob'],
  maxTurns: 8,
  permissionMode: 'dontAsk',
};

describe('connector catalog', () => {
  it('loads the shipped catalog with finance + medical connectors', () => {
    const catalog = loadConnectorCatalog();
    expect(catalog.version).toContain('phase5');
    expect(catalog.connectors.fileRead?.kind).toBe('builtin');
    expect(catalog.connectors.search?.kind).toBe('builtin');
    expect(catalog.connectors.dataLakeQuery?.kind).toBe('sdkMcp');
    expect(catalog.connectors.calendarRead?.kind).toBe('sdkMcp');
  });
});

describe('resolveToolset', () => {
  const catalog = loadConnectorCatalog();

  it('wires finance pack tools to builtins + data-lake MCP names', () => {
    const resolved = resolveToolset({
      packToolIds: ['search', 'fileRead', 'dataLakeQuery'],
      agentLoop,
      catalog,
    });
    expect(resolved.toolPolicy.availableTools).toEqual([
      'Glob',
      'Grep',
      'mcp__protean-datalake__list_datasets',
      'mcp__protean-datalake__summarize_csv',
      'Read',
    ]);
    expect(resolved.mcpServers).toEqual([
      { transport: 'sdk', serverId: 'protean-datalake', handlerId: 'dataLake' },
    ]);
    expect(resolved.wired.map((w) => w.packToolId)).toEqual([
      'search',
      'fileRead',
      'dataLakeQuery',
    ]);
  });

  it('wires medical calendarRead to protean-calendar MCP', () => {
    const resolved = resolveToolset({
      packToolIds: ['search', 'fileRead', 'calendarRead'],
      agentLoop,
      catalog,
    });
    expect(resolved.toolPolicy.allowedTools).toContain('mcp__protean-calendar__list_appointments');
    expect(resolved.mcpServers.some((s) => s.serverId === 'protean-calendar')).toBe(true);
  });

  it('falls back to agent-loop substrate when pack declares no tools', () => {
    const resolved = resolveToolset({ packToolIds: [], agentLoop, catalog });
    expect(resolved.toolPolicy.availableTools).toEqual(['Glob', 'Grep', 'Read']);
    expect(resolved.mcpServers).toEqual([]);
    expect(resolved.wired).toEqual([]);
  });

  it('fails loud for unknown pack tool ids', () => {
    expect(() =>
      resolveToolset({ packToolIds: ['telepathy'], agentLoop, catalog }),
    ).toThrow(/not in the connector registry/);
  });

  it('fails loud when a builtin exceeds the agent-loop ceiling', () => {
    expect(() =>
      resolveToolset({
        packToolIds: ['fileRead'],
        agentLoop: { ...agentLoop, availableTools: ['Grep'], allowedTools: ['Grep'] },
        catalog,
      }),
    ).toThrow(/ceiling/);
  });
});
