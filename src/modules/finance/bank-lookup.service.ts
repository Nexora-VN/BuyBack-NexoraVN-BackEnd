import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SupportedBank = { code: string; name: string; bin: string };

@Injectable()
export class BankLookupService {
  private cachedBanks: SupportedBank[] = [];
  private cachedAt = 0;

  constructor(private readonly config: ConfigService) {}

  async banks(): Promise<SupportedBank[]> {
    if (this.cachedBanks.length && Date.now() - this.cachedAt < 24 * 60 * 60 * 1000)
      return this.cachedBanks;
    let response: Response;
    try {
      response = await fetch('https://api.vietqr.io/v2/banks', {
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      if (this.cachedBanks.length) return this.cachedBanks;
      throw new BadGatewayException('BANK_DIRECTORY_UNAVAILABLE');
    }
    if (!response.ok) throw new BadGatewayException('BANK_DIRECTORY_UNAVAILABLE');
    const payload = (await response.json()) as {
      code?: string;
      data?: Array<{ code?: string; shortName?: string; name?: string; bin?: string; lookupSupported?: number }>;
    };
    const banks = payload.data
      ?.filter((bank) => bank.lookupSupported === 1 && bank.code && bank.bin && bank.name)
      .map((bank) => ({ code: bank.code!, name: bank.shortName || bank.name!, bin: bank.bin! })) ?? [];
    if (payload.code !== '00' || !banks.length) throw new BadGatewayException('BANK_DIRECTORY_UNAVAILABLE');
    this.cachedBanks = banks.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    this.cachedAt = Date.now();
    return this.cachedBanks;
  }

  async lookup(bankCode: string, accountNumber: string) {
    const bank = (await this.banks()).find((item) => item.code === bankCode);
    if (!bank) throw new BadGatewayException('BANK_LOOKUP_UNSUPPORTED');
    const clientId = this.config.get<string>('VIETQR_CLIENT_ID');
    const apiKey = this.config.get<string>('VIETQR_API_KEY');
    if (!clientId || !apiKey) throw new ServiceUnavailableException('BANK_LOOKUP_NOT_CONFIGURED');
    let response: Response;
    try {
      response = await fetch('https://api.vietqr.io/v2/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-id': clientId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ bin: Number(bank.bin), accountNumber }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new BadGatewayException('BANK_LOOKUP_UNAVAILABLE');
    }
    if (!response.ok) throw new BadGatewayException('BANK_LOOKUP_UNAVAILABLE');
    const payload = (await response.json()) as { code?: string; data?: { accountName?: string } };
    const accountHolder = payload.data?.accountName?.trim();
    if (payload.code !== '00' || !accountHolder) throw new BadGatewayException('BANK_ACCOUNT_NOT_FOUND');
    return { bankCode: bank.code, bankName: bank.name, accountHolder };
  }
}
