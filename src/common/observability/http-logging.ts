import type { Params } from 'nestjs-pino';
import { requestId, safePath, sanitize, safeError } from './observability.js';

export function httpLogging(level: string): Params {
  return {
    pinoHttp: {
      level,
      genReqId(req, res) {
        const id = requestId(req.headers['x-request-id']);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: (req) => ({ requestId: req.id, context: 'HTTP' }),
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      customSuccessObject: (_req, res, value) => ({
        ...(value as Record<string, unknown>),
        event: 'http.completed',
        outcome: res.statusCode >= 400 ? 'failure' : 'success',
      }),
      customErrorObject: (_req, _res, _err, value) => ({
        responseTime: (value as { responseTime?: number }).responseTime,
        event: 'http.completed',
        outcome: 'failure',
      }),
      autoLogging: { ignore: (req) => /\/health(?:\/live|\/ready)?(?:\?|$)/.test(req.url ?? '') },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          path: safePath(req.url ?? '/'),
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        err: safeError,
      },
      formatters: { log: (object) => sanitize(object) as Record<string, unknown> },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '[REDACTED]',
      },
    },
  };
}
