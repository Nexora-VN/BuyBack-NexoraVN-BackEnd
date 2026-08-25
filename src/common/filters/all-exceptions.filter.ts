import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

interface RequestLike {
  method: string;
  url: string;
}

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
    const request = context.getRequest<RequestLike>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown }).message;

    if (status >= 500) {
      this.logger.error({ err: exception, path: request.url }, 'Unhandled request exception');
    }

    httpAdapter.reply(
      context.getResponse(),
      {
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        message: message ?? 'Request failed',
        timestamp: new Date().toISOString(),
        path: request.url,
      },
      status,
    );
  }
}
