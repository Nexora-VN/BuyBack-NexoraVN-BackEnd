import { Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeProvider, envelopeSchema } from './saffi.contract.js';

export class ProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
@Injectable()
export class SaffiClient {
  async report(cookie: string, startDate: string, endDate: string, page: number) {
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const response = await fetch('https://pub.saffi.vn/api/affiliate/conversion-reports', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ shopeeCookies: cookie, startDate, endDate, limit: 100, page }),
        });
        if (response.status === 403) {
          await response.body?.cancel();
          throw new ProviderError('PROVIDER_AUTH_EXPIRED');
        }
        if (response.status === 400) {
          await response.body?.cancel();
          throw new ProviderError('PROVIDER_BAD_REQUEST');
        }
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          throw new ProviderError('PROVIDER_RETRYABLE');
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new ProviderError('PROVIDER_HTTP_ERROR');
        }
        const text = await response.text();
        if (text.length > 10000000) throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE');
        let parsed: unknown;
        try {
          parsed = decodeProvider(text);
        } catch {
          throw new ProviderError('PROVIDER_INVALID_JSON');
        }
        const result = envelopeSchema.safeParse(parsed);
        if (!result.success) throw new ProviderError('PROVIDER_INVALID_ENVELOPE');
        if (result.data.code !== 0) throw new ProviderError('PROVIDER_REJECTED_REQUEST');
        if (result.data.data.page_num !== page) throw new ProviderError('PROVIDER_WRONG_PAGE');
        return { report: result.data.data, raw: parsed };
      } catch (error) {
        if (error instanceof ProviderError && error.code !== 'PROVIDER_RETRYABLE') throw error;
        if (attempt === 3) throw new ProviderError('PROVIDER_UNAVAILABLE');
        await delay(500 * 2 ** attempt);
      }
    }
    throw new ProviderError('PROVIDER_UNAVAILABLE');
  }
}
