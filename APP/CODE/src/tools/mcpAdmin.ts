import { spawn } from 'node:child_process';
import { envBindings } from './registry.js';

/**
 * Settings > MCP / Tools "Test" (Phase 6). Spawns the given stdio MCP command,
 * sends a real MCP `initialize` JSON-RPC request over stdin, and waits for a
 * matching response on stdout -- an honest test of whether the server actually
 * speaks MCP, not just whether the command exists.
 */

export interface McpAdminResult {
  ok: boolean;
  message: string;
  log: string[];
}

const MCP_TEST_TIMEOUT_MS = 8000;
const INITIALIZE_REQUEST_ID = 1;

export interface StdioMcpTestInput {
  command: string;
  args: string[];
  envFrom: string[];
}

export async function testStdioMcpServer(input: StdioMcpTestInput): Promise<McpAdminResult> {
  const log: string[] = [];
  let env: Record<string, string>;
  try {
    env = envBindings(input.envFrom);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    log.push(message);
    return { ok: false, message, log };
  }

  log.push(`spawn: ${input.command} ${input.args.join(' ')}`);

  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: McpAdminResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.command, input.args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (cause) {
      const message = `Could not start "${input.command}": ${cause instanceof Error ? cause.message : String(cause)}`;
      log.push(message);
      resolve({ ok: false, message, log });
      return;
    }

    let stdoutBuffer = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      log.push(`stdout: ${text.trim()}`);
      stdoutBuffer += text;
      for (const line of stdoutBuffer.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        let parsed: { id?: number; result?: unknown; error?: { message?: string } };
        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          continue; // partial line -- keep buffering
        }
        if (parsed.id === INITIALIZE_REQUEST_ID) {
          if (parsed.error !== undefined) {
            settle({
              ok: false,
              message: `MCP server responded to initialize with an error: ${parsed.error.message ?? 'unknown error'}`,
              log,
            });
          } else {
            settle({ ok: true, message: 'MCP server responded to initialize successfully.', log });
          }
          return;
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      log.push(`stderr: ${chunk.toString('utf8').trim()}`);
    });
    child.on('error', (err: Error) => {
      settle({ ok: false, message: `Could not start "${input.command}": ${err.message}`, log });
    });
    child.on('exit', (code, signal) => {
      settle({
        ok: false,
        message: `Process exited before responding to initialize (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`,
        log,
      });
    });

    const initializeRequest = `${JSON.stringify({
      jsonrpc: '2.0',
      id: INITIALIZE_REQUEST_ID,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'protean-settings-test', version: '1.0.0' },
      },
    })}\n`;
    child.stdin?.write(initializeRequest);

    const timer = setTimeout(() => {
      settle({
        ok: false,
        message: `Timed out after ${MCP_TEST_TIMEOUT_MS}ms waiting for the server to respond to initialize.`,
        log,
      });
    }, MCP_TEST_TIMEOUT_MS);
  });
}
