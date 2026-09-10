import { ConfigService } from '@nestjs/config';
import { CredentialService } from './credential.service.js';
import type { FinanceRepository } from '../finance/finance.repository.js';

describe('AddLiveTag env secret', () => {
  const metadata = {
    version: 2,
    accountId: '420',
    expectedAffiliate: 'affiliate',
    verifiedAt: null,
    status: 'EXPIRED',
    ciphertext: 'old-db-value',
  };
  it('reads only env, including after an expired-key rotation', async () => {
    const findUnique = jest.fn().mockResolvedValue(metadata);
    const repo = { db: { providerCredential: { findUnique } } } as unknown as FinanceRepository;
    const service = new CredentialService(
      repo,
      new ConfigService({ ADDLIVETAG_API_KEY: 'test-env-key-not-real' }),
    );
    expect(await service.read()).toMatchObject({
      apiKey: 'test-env-key-not-real',
      accountId: '420',
    });
  });
  it('does not fall back to DB when env is missing', async () => {
    const findUnique = jest.fn().mockResolvedValue(metadata);
    const repo = { db: { providerCredential: { findUnique } } } as unknown as FinanceRepository;
    const config = new ConfigService({});
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'ADDLIVETAG_API_KEY') return undefined;
      return undefined;
    });
    const service = new CredentialService(repo, config);
    await expect(service.read()).rejects.toThrow('ADDLIVETAG_API_KEY_NOT_CONFIGURED');
    expect(findUnique).not.toHaveBeenCalled();
  });
});
