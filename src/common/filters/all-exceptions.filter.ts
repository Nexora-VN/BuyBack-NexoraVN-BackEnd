import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { AppError, databaseError } from '../observability/app-error.js';
import { requestId, safeError, safePath } from '../observability/observability.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }
  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<{ id?: string; url: string }>();
    const error = exception instanceof HttpException ? exception : databaseError(exception);
    const status = error.getStatus();
    const raw = error.getResponse();
    const body =
      typeof raw === 'object'
        ? (raw as { message?: unknown; code?: string; details?: unknown })
        : { message: raw };
    const isCode = typeof body.message === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(body.message);
    const code =
      body.code ??
      (isCode
        ? String(body.message)
        : status === 400 && Array.isArray(body.message)
          ? 'VALIDATION_ERROR'
          : (HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR'));
    const message =
      error instanceof AppError
        ? String(body.message)
        : status >= 500
          ? 'Dịch vụ tạm thời không sẵn sàng.'
          : isCode
            ? code
            : typeof body.message === 'string'
              ? body.message
              : 'Thông tin không hợp lệ.';
    const id = requestId(request.id);
    const path = safePath(request.url);
    this.logger[status >= 500 ? 'error' : 'warn'](
      {
        event: 'request.failed',
        requestId: id,
        path,
        stage: error instanceof AppError ? error.stage : undefined,
        errorCode: code,
        productSaved:
          error instanceof AppError && error.stage === 'save_history' ? true : undefined,
        outcome: 'failure',
        err: safeError(exception),
      },
      'Request failed',
    );
    const details = Array.isArray(body.details)
      ? body.details.map((item) => {
          const d = item as { field?: unknown; code?: unknown; message?: unknown };
          return {
            field: typeof d.field === 'string' ? d.field : 'unknown',
            code: typeof d.code === 'string' ? d.code : 'INVALID',
            message: typeof d.message === 'string' ? d.message : 'Giá trị không hợp lệ.',
          };
        })
      : undefined;
    httpAdapter.setHeader(context.getResponse(), 'X-Request-Id', id);
    httpAdapter.reply(
      context.getResponse(),
      {
        statusCode: status,
        code,
        message,
        requestId: id,
        timestamp: new Date().toISOString(),
        path,
        ...(details ? { details } : {}),
      },
      status,
    );
  }
}
