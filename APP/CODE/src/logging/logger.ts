import type { LogLevel } from '../config/loadConfig.js';
import { LEVEL_ORDER, type LogEvent, type LogLayer } from './events.js';
import { redactValue } from './redact.js';

export type LogSink = (line: string) => void;

export interface Logger {
  log(
    level: LogLevel,
    layer: LogLayer,
    event: string,
    msg: string,
    fields?: Partial<Pick<LogEvent, 'turnId' | 'sessionId' | 'data'>>,
  ): void;
  child(layer: LogLayer): LayerLogger;
}

/** Convenience wrapper bound to one layer. */
export interface LayerLogger {
  trace(event: string, msg: string, fields?: LoggerFields): void;
  debug(event: string, msg: string, fields?: LoggerFields): void;
  info(event: string, msg: string, fields?: LoggerFields): void;
  warn(event: string, msg: string, fields?: LoggerFields): void;
  error(event: string, msg: string, fields?: LoggerFields): void;
}

export type LoggerFields = Partial<Pick<LogEvent, 'turnId' | 'sessionId' | 'data'>>;

const defaultSink: LogSink = (line) => {
  process.stdout.write(line + '\n');
};

/** Structured JSONL logger. Every event is redacted before it leaves the process. */
export function createLogger(minLevel: LogLevel, sink: LogSink = defaultSink): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  const log: Logger['log'] = (level, layer, event, msg, fields) => {
    if (LEVEL_ORDER[level] < threshold) return;
    const entry: LogEvent = {
      ts: new Date().toISOString(),
      level,
      layer,
      event,
      msg,
      ...(fields?.turnId !== undefined ? { turnId: fields.turnId } : {}),
      ...(fields?.sessionId !== undefined ? { sessionId: fields.sessionId } : {}),
      ...(fields?.data !== undefined ? { data: fields.data } : {}),
    };
    sink(JSON.stringify(redactValue(entry)));
  };

  const child = (layer: LogLayer): LayerLogger => ({
    trace: (event, msg, fields) => log('trace', layer, event, msg, fields),
    debug: (event, msg, fields) => log('debug', layer, event, msg, fields),
    info: (event, msg, fields) => log('info', layer, event, msg, fields),
    warn: (event, msg, fields) => log('warn', layer, event, msg, fields),
    error: (event, msg, fields) => log('error', layer, event, msg, fields),
  });

  return { log, child };
}
