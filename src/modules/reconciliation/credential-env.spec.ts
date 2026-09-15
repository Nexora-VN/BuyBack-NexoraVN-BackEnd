import { ConfigService } from '@nestjs/config';
import { CredentialService } from './credential.service.js';
import { FinanceCrypto } from '../finance/crypto.service.js';
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

describe('Shopee session credential', () => {
  const crypto = new FinanceCrypto(new ConfigService({ FINANCE_ENCRYPTION_KEY: 'b'.repeat(64) }));
  it('rotates, encrypts, and reads back Shopee cookie', async () => {
    let stored: any = null;
    const tx = {
      providerCredential: {
        upsert: jest.fn().mockImplementation(({ create, update }) => {
          stored = { ...(stored ?? create), ...update, version: (stored?.version ?? 0) + 1 };
          return {
            id: 'SHOPEE',
            version: stored.version,
            status: stored.status,
            lastValidatedAt: stored.lastValidatedAt,
            updatedAt: new Date(),
          };
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const repo = {
      transaction: jest.fn().mockImplementation((cb) => cb(tx)),
      db: {
        providerCredential: {
          findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
        },
      },
    } as unknown as FinanceRepository;

    const service = new CredentialService(repo, new ConfigService({}), crypto);
    const rotated = await service.rotateShopee('SPC_EC=my-shopee-secret-cookie-123456789', 'admin-1');
    expect(rotated.status).toBe('ACTIVE');
    expect(rotated.version).toBe(1);
    expect(stored.ciphertext).toBeDefined();
    expect(stored.ciphertext).not.toContain('my-shopee-secret-cookie-123456789');

    const read = await service.readShopee();
    expect(read.version).toBe(1);
    expect(read.cookie).toBe('SPC_EC=my-shopee-secret-cookie-123456789');
  });
});

