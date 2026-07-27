import type { LogLevel } from '../config/loadConfig.js';

/** The layer a log event originates from (ARCHITECTURE §6). */
export type LogLayer = 'server' | 'watcher' | 'agent' | 'gateway' | 'gui' | 'config' | 'spike';

/**
 * One structured log event: machine-parseable JSONL, with an explanatory human
 * message ("Watcher chose Tier 1 because…"), never a bare code (Law 6).
 */
export interface LogEvent {
  ts: string;
  level: LogLevel;
  layer: LogLayer;
  event: string;
  msg: string;
  turnId?: string;
  sessionId?: string;
  data?: Record<string, unknown>;
}

export const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};
