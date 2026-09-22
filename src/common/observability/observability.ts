import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';

export const correlation = new AsyncLocalStorage<{ requestId?: string; jobId?: string }>();
export const requestId = (value: unknown): string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : randomUUID();
export const safePath = (value: string): string => value.split(/[?#]/)[0] ?? '/';

// Unknown error messages may contain SQL parameters, URLs or credentials. Keep only
// machine codes and stack frames; the public message comes from our error catalog.
export function safeError(error: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4 || !error || typeof error !== 'object') return { name: 'UnknownError' };
  const value = error as {
    name?: unknown;
    code?: unknown;
    stack?: unknown;
    cause?: unknown;
    message?: unknown;
  };
  const code =
    typeof value.code === 'string' && /^[A-Z0-9_]{2,80}$/.test(value.code) ? value.code : undefined;
  return {
    name:
      typeof value.name === 'string' && /^[A-Za-z.]{1,80}$/.test(value.name) ? value.name : 'Error',
    code,
    reason:
      typeof value.message === 'string' &&
      value.message.includes('no unique or exclusion constraint')
        ? 'DATABASE_SCHEMA_MISMATCH'
        : undefined,
    stack:
      typeof value.stack === 'string'
        ? value.stack
            .split('\n')
            .filter((line) => /^\s+at /.test(line))
            .slice(0, 12)
            .map((line) =>
              line.replace(/(?:https?:\/\/|postgres(?:ql)?:\/\/)[^\s)]+/g, '[REDACTED]'),
            )
            .join('\n')
        : undefined,
    cause: value.cause ? safeError(value.cause, depth + 1) : undefined,
  };
}

const sensitive =
  /password|secret|token|cookie|authorization|api.?key|connection|email|phone|bank|accountnumber|payload|body|query|headers|parameters/i;
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value instanceof Error) return safeError(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        sensitive.test(key) ? '[REDACTED]' : sanitize(v, depth + 1),
      ]),
    );
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string')
    return value
      .slice(0, 2000)
      .replace(/(?:https?:\/\/|postgres(?:ql)?:\/\/)[^\s]+/gi, '[URL]')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
      .replace(
        /(?:Bearer\s+\S+|(?:password|secret|token|api[_-]?key)\s*[:=]\s*\S+)/gi,
        '[REDACTED]',
      );
  return value;
}

const logger = new Logger('Operations');
export function event(
  level: 'debug' | 'log' | 'warn' | 'error',
  name: string,
  fields: Record<string, unknown> = {},
) {
  logger[level]({ event: name, ...correlation.getStore(), ...(sanitize(fields) as object) });
}

export async function step<T>(
  stage: string,
  operation: () => Promise<T> | T,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const started = performance.now();
  event('debug', 'operation.started', { stage, ...fields });
  try {
    const result = await operation();
    event('debug', 'operation.completed', {
      stage,
      durationMs: Math.round(performance.now() - started),
      outcome: 'success',
      ...fields,
    });
    return result;
  } catch (error) {
    // The HTTP filter or job boundary owns the full error log, avoiding duplicate causes.
    event('debug', 'operation.failed', {
      stage,
      durationMs: Math.round(performance.now() - started),
      outcome: 'failure',
      ...fields,
    });
    throw error;
  }
}
