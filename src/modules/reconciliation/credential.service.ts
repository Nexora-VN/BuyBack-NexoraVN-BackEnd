import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinanceRepository, audit } from '../finance/finance.repository.js';
import { FinanceCrypto } from '../finance/crypto.service.js';
import type { z } from 'zod';
import type { providerInput, verificationInput } from './addlivetag.contract.js';
const select = {
  id: true,
  version: true,
  status: true,
  accountId: true,
  expectedAffiliate: true,
  verifiedAt: true,
  verificationEvidence: true,
  lastValidatedAt: true,
  updatedAt: true,
} as const;

const shopeeSelect = {
  id: true,
  version: true,
  status: true,
  lastValidatedAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CredentialService {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly config: ConfigService,
    private readonly crypto?: FinanceCrypto,
  ) {}
  shopeeMetadata() {
    return this.repo.db.providerCredential.findUnique({ where: { id: 'SHOPEE' }, select: shopeeSelect });
  }
  rotateShopee(cookie: string, actor: string) {
    if (!this.crypto) throw new ServiceUnavailableException('CRYPTO_SERVICE_NOT_CONFIGURED');
    const encrypted = this.crypto.encrypt(cookie, 'provider:SHOPEE');
    return this.repo.transaction(async (tx) => {
      const row = await tx.providerCredential.upsert({
        where: { id: 'SHOPEE' },
        create: {
          id: 'SHOPEE',
          ...encrypted,
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
          rotatedBy: actor,
          version: 1,
        },
        update: {
          ...encrypted,
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
          version: { increment: 1 },
          rotatedBy: actor,
        },
        select: shopeeSelect,
      });
      await audit(tx, actor, 'SHOPEE_CREDENTIAL_ROTATED', 'SHOPEE', { version: row.version });
      return row;
    });
  }
  async readShopee() {
    if (!this.crypto) throw new ServiceUnavailableException('CRYPTO_SERVICE_NOT_CONFIGURED');
    const row = await this.repo.db.providerCredential.findUnique({ where: { id: 'SHOPEE' } });
    if (!row || row.status === 'EXPIRED')
      throw new ServiceUnavailableException('SHOPEE_CREDENTIAL_REQUIRED');
    return { version: row.version, cookie: this.crypto.decrypt(row, 'provider:SHOPEE') };
  }
  async markShopee(version: number, status: 'ACTIVE' | 'EXPIRED') {
    await this.repo.db.providerCredential.updateMany({
      where: { id: 'SHOPEE', version },
      data: { status, ...(status === 'ACTIVE' ? { lastValidatedAt: new Date() } : {}) },
    });
  }
  metadata() {
    return this.repo.db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' }, select });
  }
  rotate(input: z.infer<typeof providerInput>, actor: string) {
    return this.repo.transaction(async (tx) => {
      // Preserve legacy columns, but never persist an AddLiveTag secret.
      const data = {
        ciphertext: '',
        iv: '',
        tag: '',
        accountId: input.accountId,
        expectedAffiliate: input.expectedAffiliate,
        rotatedBy: actor,
      };
      const row = await tx.providerCredential.upsert({
        where: { id: 'ADDLIVETAG' },
        create: { id: 'ADDLIVETAG', ...data },
        update: {
          ...data,
          version: { increment: 1 },
          status: 'UNVERIFIED',
          lastValidatedAt: null,
          verifiedAt: null,
          verificationEvidence: null,
        },
        select,
      });
      await audit(tx, actor, 'PROVIDER_ACCOUNT_UPDATED', 'ADDLIVETAG', {
        version: row.version,
        accountId: row.accountId,
      });
      return row;
    });
  }
  verify(input: z.infer<typeof verificationInput>, actor: string) {
    return this.repo.transaction(async (tx) => {
      const row = await tx.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
      if (!row || row.version !== input.version || row.status !== 'ACTIVE')
        throw new ConflictException('SYNC_ACTIVE_CREDENTIAL_BEFORE_VERIFY');
      const result = await tx.providerCredential.update({
        where: { id: row.id },
        data: { verifiedAt: new Date(), verificationEvidence: input.evidence },
        select,
      });
      await audit(tx, actor, 'PROVIDER_ACCOUNT_VND_VERIFIED', row.id, {
        accountId: row.accountId,
        version: row.version,
        evidence: input.evidence,
      });
      return result;
    });
  }
  async read() {
    const apiKey = this.config.get<string>('ADDLIVETAG_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ADDLIVETAG_API_KEY_NOT_CONFIGURED');
    const row = await this.repo.db.providerCredential.findUnique({ where: { id: 'ADDLIVETAG' } });
    if (!row || !row.accountId || !row.expectedAffiliate)
      throw new ServiceUnavailableException('PROVIDER_ACCOUNT_REQUIRED');
    // A sync can retry after the operator replaces an expired env key and restarts BE.
    return {
      version: row.version,
      apiKey,
      accountId: row.accountId,
      expectedAffiliate: row.expectedAffiliate,
      verifiedAt: row.verifiedAt,
    };
  }
  async mark(version: number, status: 'ACTIVE' | 'EXPIRED') {
    await this.repo.db.providerCredential.updateMany({
      where: { id: 'ADDLIVETAG', version },
      data: { status, ...(status === 'ACTIVE' ? { lastValidatedAt: new Date() } : {}) },
    });
  }
}
