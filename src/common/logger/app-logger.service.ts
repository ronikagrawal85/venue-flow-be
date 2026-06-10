import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { getRequestContext } from './async-context';

@Injectable()
export class AppLoggerService implements LoggerService {
  private formatMessage(
    level: string,
    message: unknown,
    context?: string,
  ): string {
    const reqCtx = getRequestContext();

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? 'Application',
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    if (reqCtx?.correlationId) entry.correlationId = reqCtx.correlationId;
    if (reqCtx?.userId) entry.userId = reqCtx.userId;
    if (reqCtx?.method) entry.method = reqCtx.method;
    if (reqCtx?.url) entry.url = reqCtx.url;

    return JSON.stringify(entry);
  }

  log(message: unknown, context?: string): void {
    console.log(this.formatMessage('INFO', message, context));
  }

  error(message: unknown, trace?: string, context?: string): void {
    const reqCtx = getRequestContext();

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context: context ?? 'Application',
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    if (trace) entry.stackTrace = trace;
    if (reqCtx?.correlationId) entry.correlationId = reqCtx.correlationId;
    if (reqCtx?.userId) entry.userId = reqCtx.userId;
    if (reqCtx?.method) entry.method = reqCtx.method;
    if (reqCtx?.url) entry.url = reqCtx.url;

    console.error(JSON.stringify(entry));
  }

  warn(message: unknown, context?: string): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  debug(message: unknown, context?: string): void {
    console.debug(this.formatMessage('DEBUG', message, context));
  }

  verbose(message: unknown, context?: string): void {
    console.log(this.formatMessage('VERBOSE', message, context));
  }

  setLogLevels?(levels: LogLevel[]): void {
    // No-op — structured logger outputs all levels
  }
}
