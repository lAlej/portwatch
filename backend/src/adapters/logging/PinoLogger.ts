import pino, { type Logger as Pino } from 'pino';
import type { Logger } from '../../domain/ports/Logger.js';

export class PinoLogger implements Logger {
  private readonly base: Pino;

  constructor(level: string = 'info', pretty: boolean = false) {
    this.base = pino({
      level,
      transport: pretty
        ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    });
  }

  info(msg: string, meta?: Record<string, unknown>) {
    this.base.info(meta ?? {}, msg);
  }
  warn(msg: string, meta?: Record<string, unknown>) {
    this.base.warn(meta ?? {}, msg);
  }
  error(msg: string, meta?: Record<string, unknown>) {
    this.base.error(meta ?? {}, msg);
  }
  debug(msg: string, meta?: Record<string, unknown>) {
    this.base.debug(meta ?? {}, msg);
  }
}
