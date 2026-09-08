import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { FinanceCrypto } from '../finance/crypto.service.js';
import { FinanceRepository, audit } from '../finance/finance.repository.js';

const credentialSelect = {
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
    private readonly crypto: FinanceCrypto,
  ) {}
  metadata() {
    return this.repo.db.providerCredential.findUnique({
      where: { id: 'SAFFI' },
      select: credentialSelect,
    });
  }
  rotate(cookie: string, actor: string) {
    const encrypted = this.crypto.encrypt(cookie, 'provider:SAFFI');
    return this.repo.transaction(async (tx) => {
      const result = await tx.providerCredential.upsert({
        where: { id: 'SAFFI' },
        create: { id: 'SAFFI', ...encrypted, rotatedBy: actor },
        update: {
          ...encrypted,
          rotatedBy: actor,
          status: 'UNVERIFIED',
          lastValidatedAt: null,
          version: { increment: 1 },
        },
        select: credentialSelect,
      });
      await audit(tx, actor, 'PROVIDER_CREDENTIAL_ROTATED', 'SAFFI', { version: result.version });
      return result;
    });
  }
  async read() {
    const row = await this.repo.db.providerCredential.findUnique({ where: { id: 'SAFFI' } });
    if (!row || row.status === 'EXPIRED')
      throw new ServiceUnavailableException('PROVIDER_CREDENTIAL_REQUIRED');
    return { version: row.version, cookie: this.crypto.decrypt(row, 'provider:SAFFI') };
  }
  async mark(version: number, status: 'ACTIVE' | 'EXPIRED') {
    await this.repo.db.providerCredential.updateMany({
      where: { id: 'SAFFI', version },
      data: { status, ...(status === 'ACTIVE' ? { lastValidatedAt: new Date() } : {}) },
    });
  }
}
