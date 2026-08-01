import { describe, expect, it } from 'vitest';
import { builtinToolsFromPolicy, buildClaudeQueryOptions } from '../src/gateway/adapters/claude.js';
import type { GatewayRequest } from '../src/contracts/gateway.js';
import type { ToolPolicy } from '../src/contracts/agentLoop.js';

describe('builtinToolsFromPolicy', () => {
  it('strips mcp__ names so Options.tools stays SDK-builtin-only', () => {
    const policy: ToolPolicy = {
      availableTools: ['Read', 'mcp__protean-datalake__list_datasets'],
      allowedTools: ['Read', 'mcp__protean-datalake__list_datasets'],
      maxTurns: 8,
      permissionMode: 'dontAsk',
    };
    expect(builtinToolsFromPolicy(policy)).toEqual(['Read']);
  });
});

describe('buildClaudeQueryOptions MCP wiring', () => {
  it('materializes sdk MCP servers and sets strictMcpConfig', () => {
    const request: GatewayRequest = {
      turnId: 't1',
      model: 'm',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      toolPolicy: {
        availableTools: ['Read', 'mcp__protean-datalake__list_datasets'],
        allowedTools: ['Read', 'mcp__protean-datalake__list_datasets'],
        maxTurns: 4,
        permissionMode: 'dontAsk',
      },
      workspaceDir: '/repo',
      datasetsDir: '/repo/datasets',
      mcpServers: [{ transport: 'sdk', serverId: 'protean-datalake', handlerId: 'dataLake' }],
    };
    const options = buildClaudeQueryOptions(request);
    expect(options.tools).toEqual(['Read']);
    expect(options.allowedTools).toContain('mcp__protean-datalake__list_datasets');
    expect(options.strictMcpConfig).toBe(true);
    expect(options.mcpServers).toBeDefined();
    expect(options.mcpServers?.['protean-datalake']).toBeDefined();
  });

  it('fails loud when mcpServers are set without datasetsDir', () => {
    const request: GatewayRequest = {
      turnId: 't1',
      model: 'm',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      mcpServers: [{ transport: 'sdk', serverId: 'protean-datalake', handlerId: 'dataLake' }],
    };
    expect(() => buildClaudeQueryOptions(request)).toThrow(/datasetsDir/);
  });
});
