/**
 * Human-readable renderer for JSONL log streams (ARCHITECTURE §6).
 * Usage: tsx src/logging/render.ts < some.jsonl   (or pipe the server's stdout through it)
 */
import { createInterface } from 'node:readline';
import type { LogEvent } from './events.js';

const LEVEL_PAD = 5;

export function renderLogLine(raw: string): string {
  let event: LogEvent;
  try {
    event = JSON.parse(raw) as LogEvent;
  } catch {
    return raw; // not a JSON event — pass through untouched
  }
  const turn = event.turnId !== undefined ? ` turn=${event.turnId.slice(0, 8)}` : '';
  const data =
    event.data !== undefined && Object.keys(event.data).length > 0
      ? ` ${JSON.stringify(event.data)}`
      : '';
  return `${event.ts} ${event.level.toUpperCase().padEnd(LEVEL_PAD)} [${event.layer}] ${event.event}${turn} — ${event.msg}${data}`;
}

const isDirectRun = process.argv[1]?.endsWith('render.ts') === true;
if (isDirectRun) {
  createInterface({ input: process.stdin }).on('line', (line) => {
    console.log(renderLogLine(line));
  });
}
