import { AppError, databaseError } from './app-error.js';
import { correlation, requestId, safeError, safePath, sanitize } from './observability.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';

describe('Observability contracts', () => {
  it('preserves valid IDs and replaces invalid input', () => {
    const id = requestId(null);
    expect(requestId(id)).toBe(id);
    expect(requestId('req-4')).not.toBe('req-4');
    expect(safePath('/api?token=secret#value')).toBe('/api');
  });
  it('isolates concurrent async correlation contexts', async () => {
    const ids = await Promise.all(['a', 'b'].map((requestId) => correlation.run({ requestId }, async () => {
      await Promise.resolve(); return correlation.getStore()?.requestId;
    })));
    expect(ids).toEqual(['a', 'b']);
  });
  it('never serializes nested secret-bearing errors or metadata', () => {
    const error = new Error('postgres://user:password@host/db token=secret', { cause: new Error('email@example.com password=hidden') });
    const result = JSON.stringify(sanitize({ password: 'hidden', nested: { authorization: 'Bearer secret', err: error } }));
    for (const secret of ['password@host', 'token=secret', 'email@example.com', 'hidden', 'Bearer secret']) expect(result).not.toContain(secret);
    expect(safeError(error)).toHaveProperty('cause');
  });
  it.each([['P1001', 503, 'DATABASE_UNAVAILABLE'], ['42P10', 500, 'DATABASE_SCHEMA_MISMATCH'], ['P2002', 409, 'RESOURCE_CONFLICT']])('maps database %s safely', (code, status, expected) => {
    const error = databaseError({ code, message: 'sensitive query' }, 'upsert_product');
    expect(error.getStatus()).toBe(status); expect(error.code).toBe(expected);
    expect(JSON.stringify(error.getResponse())).not.toContain('sensitive');
  });
  it('returns real HTTP failures with correlation and no internal cause', () => {
    const reply = jest.fn(), setHeader = jest.fn(), error = jest.fn(), warn = jest.fn();
    const filter = new AllExceptionsFilter({ httpAdapter: { reply, setHeader } } as unknown as HttpAdapterHost, { setContext: jest.fn(), error, warn } as unknown as PinoLogger);
    const id = requestId(null);
    const host = { switchToHttp: () => ({ getRequest: () => ({ id, url: '/api/v1/generate-affiliate?token=hidden' }), getResponse: () => ({}) }) } as unknown as ArgumentsHost;
    filter.catch(new AppError('DATABASE_SCHEMA_MISMATCH', 500, 'Hệ thống cần cập nhật.', 'upsert_product', new Error('secret')), host);
    expect(reply.mock.calls[0]![1]).toMatchObject({ statusCode: 500, code: 'DATABASE_SCHEMA_MISMATCH', requestId: id, path: '/api/v1/generate-affiliate' });
    expect(JSON.stringify(reply.mock.calls)).not.toContain('secret');
    expect(error).toHaveBeenCalledTimes(1);
    filter.catch(new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid', details: [{ field: 'url', code: 'isUrl', message: 'Invalid' }] }), host);
    expect(reply.mock.calls[1]![1]).toHaveProperty('details');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
