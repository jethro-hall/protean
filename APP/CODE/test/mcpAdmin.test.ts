import { describe, expect, it } from 'vitest';
import { testStdioMcpServer } from '../src/tools/mcpAdmin.js';

const NODE = process.execPath;

const RESPOND_OK_SCRIPT = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05' } }) + '\\n');
});
`;

const RESPOND_ERROR_SCRIPT = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { message: 'unsupported protocol version' } }) + '\\n');
});
`;

describe('testStdioMcpServer', () => {
  it('reports success when the server responds correctly to initialize', async () => {
    const result = await testStdioMcpServer({ command: NODE, args: ['-e', RESPOND_OK_SCRIPT], envFrom: [] });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('responded to initialize successfully');
    expect(result.log.some((line) => line.startsWith('spawn:'))).toBe(true);
  });

  it('surfaces the server\'s own JSON-RPC error message', async () => {
    const result = await testStdioMcpServer({ command: NODE, args: ['-e', RESPOND_ERROR_SCRIPT], envFrom: [] });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('unsupported protocol version');
  });

  it('reports a specific message when the command does not exist -- never a bare "error"', async () => {
    const result = await testStdioMcpServer({ command: 'this-command-does-not-exist-xyz', args: [], envFrom: [] });
    expect(result.ok).toBe(false);
    expect(result.message).not.toBe('error');
    expect(result.message).toContain('this-command-does-not-exist-xyz');
  });

  it('reports a specific message when the process exits before responding', async () => {
    const result = await testStdioMcpServer({ command: NODE, args: ['-e', 'process.exit(1)'], envFrom: [] });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('exited before responding');
  });

  it('reports a specific message when a required envFrom variable is unset', async () => {
    const result = await testStdioMcpServer({
      command: NODE,
      args: ['-e', RESPOND_OK_SCRIPT],
      envFrom: ['PROTEAN_TEST_DEFINITELY_UNSET_VAR_XYZ'],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('PROTEAN_TEST_DEFINITELY_UNSET_VAR_XYZ');
  });
});
