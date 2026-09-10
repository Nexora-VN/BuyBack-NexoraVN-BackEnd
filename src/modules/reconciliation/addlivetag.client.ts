import { Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { decodeAddLiveTag } from './addlivetag.contract.js';
import { ProviderError } from './saffi.client.js';

@Injectable()
export class AddLiveTagClient {
  async report(apiKey: string, accountId: string, from: string, to: string, page: number) {
    const url = new URL('https://addlivetag.com/api/v1/conversions.php');
    url.search = new URLSearchParams({
      api_key: apiKey,
      type: 'items',
      account_id: accountId,
      from,
      to,
      page: String(page),
      page_size: '50',
    }).toString();
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          redirect: 'error',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if ([401, 403].includes(response.status))
            throw new ProviderError('PROVIDER_AUTH_EXPIRED');
          if (response.status === 429 || response.status >= 500)
            throw new ProviderError('PROVIDER_RETRYABLE');
          throw new ProviderError('PROVIDER_BAD_REQUEST');
        }
        // Bound the stream, not just the final string. Never persist or log request URLs.
        const reader = response.body?.getReader();
        if (!reader) throw new ProviderError('PROVIDER_EMPTY_RESPONSE');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 10_000_000) throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE');
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        let report: ReturnType<typeof decodeAddLiveTag>;
        try {
          report = decodeAddLiveTag(Buffer.concat(chunks).toString('utf8'));
        } catch {
          throw new ProviderError('PROVIDER_INVALID_CONTRACT');
        }
        if (report.meta.page !== page || report.meta.page_size !== 50 || report.data.length > 50)
          throw new ProviderError('PROVIDER_WRONG_PAGE');
        return report;
      } catch (error) {
        if (error instanceof ProviderError && error.code !== 'PROVIDER_RETRYABLE') throw error;
        if (attempt === 3) throw new ProviderError('PROVIDER_UNAVAILABLE');
        await delay(500 * 2 ** attempt);
      }
    }
    throw new ProviderError('PROVIDER_UNAVAILABLE');
  }
}
