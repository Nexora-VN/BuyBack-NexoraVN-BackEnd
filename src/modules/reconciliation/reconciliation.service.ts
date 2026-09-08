import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval } from '@nestjs/schedule';
import { createHash, randomUUID } from 'node:crypto';
import { FinanceRepository, audit, json } from '../finance/finance.repository.js';
import { CredentialService } from './credential.service.js';
import { ProviderError, SaffiClient } from './saffi.client.js';
import { checkoutSchema } from './saffi.contract.js';
import { ReconciliationEngine } from './reconciliation-engine.js';

function vietnamDate(offset: number) {
  return new Date(Date.now() + 7 * 3600000 - offset * 86400000).toISOString().slice(0, 10);
}
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !/cookie|password|secret|authorization|token/i.test(k)).map(([k, v]) => [k, sanitize(v)]));
  return value;
}
@Injectable()
export class ReconciliationService {
  private readonly owner = randomUUID();
  private busy = false;
  private readonly logger = new Logger(ReconciliationService.name);
  constructor(private readonly repo: FinanceRepository, private readonly credentials: CredentialService,
    private readonly client: SaffiClient, private readonly engine: ReconciliationEngine, private readonly config: ConfigService) {}
  async enqueue(startDate: string, endDate: string, source: string, actor?: string) {
    return this.repo.transaction(async tx => {
      const existing = await tx.reconciliationBatch.findFirst({ where: { startDate, endDate, status: { in: ['QUEUED', 'RUNNING'] } } });
      if (existing) return existing;
      const row = await tx.reconciliationBatch.create({ data: { startDate, endDate, source, createdBy: actor } });
      await audit(tx, actor ?? null, 'RECONCILIATION_QUEUED', row.id);
      return row;
    });
  }
  async retry(id: string, actor: string) {
    const row = await this.repo.db.reconciliationBatch.findUnique({ where: { id } });
    if (!row || row.status !== 'FAILED') throw new ConflictException('ONLY_FAILED_BATCH_CAN_RETRY');
    return this.enqueue(row.startDate, row.endDate, 'RETRY', actor);
  }
  @Cron('0 10 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async hourly() {
    if (this.config.get<boolean>('RECONCILIATION_ENABLED')) await this.enqueue(vietnamDate(6), vietnamDate(0), 'HOURLY');
  }
  @Cron('0 15 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async nightly() {
    if (this.config.get<boolean>('RECONCILIATION_ENABLED')) await this.enqueue(vietnamDate(89), vietnamDate(0), 'NIGHTLY');
  }
  @Interval(5000)
  async work() {
    if (this.busy) return;
    this.busy = true;
    let leased = false;
    try {
      leased = await this.repo.transaction(async tx => {
        const lease = await tx.jobLease.findUnique({ where: { id: 'SAFFI_SYNC' } });
        if (lease && lease.expiresAt > new Date()) return false;
        await tx.jobLease.upsert({ where: { id: 'SAFFI_SYNC' }, create: { id: 'SAFFI_SYNC', owner: this.owner, expiresAt: new Date(Date.now() + 300000) },
          update: { owner: this.owner, expiresAt: new Date(Date.now() + 300000) } });
        // A RUNNING batch with no live lease belongs to a crashed/expired worker.
        await tx.reconciliationBatch.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', errorCode: 'WORKER_LEASE_EXPIRED', completedAt: new Date() } });
        return true;
      });
      if (!leased) return;
      const batch = await this.repo.db.reconciliationBatch.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
      if (batch) await this.run(batch);
    } catch {
      this.logger.error('RECONCILIATION_WORKER_FAILED');
    } finally {
      if (leased) await this.repo.db.jobLease.deleteMany({ where: { id: 'SAFFI_SYNC', owner: this.owner } }).catch(() => undefined);
      this.busy = false;
    }
  }
  private async renew() {
    const result = await this.repo.db.jobLease.updateMany({
      where: { id: 'SAFFI_SYNC', owner: this.owner, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() + 300000) },
    });
    if (!result.count) throw new ProviderError('WORKER_LEASE_LOST');
  }
  private async run(batch: { id: string; startDate: string; endDate: string }) {
    let version: number | undefined;
    try {
      const credential = await this.credentials.read();
      version = credential.version;
      await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { status: 'RUNNING', credentialVersion: version } });
      const seen = new Set<string>();
      let total: number | undefined;
      let received = 0;
      for (let page = 1; page <= 10000; page++) {
        await this.renew();
        const response = await this.client.report(credential.cookie, batch.startDate, batch.endDate, page);
        await this.renew();
        await this.credentials.mark(version, 'ACTIVE');
        if (total !== undefined && total !== response.report.total_count) throw new ProviderError('PAGINATION_TOTAL_CHANGED');
        total = response.report.total_count;
        const raw = sanitize(response.raw);
        await this.repo.db.reconciliationPage.create({ data: { batchId: batch.id, page,
          hash: createHash('sha256').update(JSON.stringify(raw)).digest('hex'), payload: json(raw) } });
        for (const candidate of response.report.list) {
          const parsed = checkoutSchema.safeParse(candidate);
          if (!parsed.success) {
            await this.repo.db.reconciliationIssue.create({ data: { batchId: batch.id, type: 'INVALID_PROVIDER_PAYLOAD',
              payload: json({ fields: parsed.error.issues.map(i => i.path.join('.')) }) } });
            await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { failedRecords: { increment: 1 } } });
            continue;
          }
          if (seen.has(parsed.data.checkout_id)) throw new ProviderError('DUPLICATE_CHECKOUT_IN_PAGINATION');
          seen.add(parsed.data.checkout_id);
          await this.renew();
          try {
            await this.engine.ingest(batch.id, parsed.data);
            await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { records: { increment: 1 } } });
          } catch {
            await this.repo.db.reconciliationIssue.create({ data: { batchId: batch.id,
              checkoutId: parsed.data.checkout_id, type: 'RECORD_PERSIST_FAILED', payload: {} } });
            await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { failedRecords: { increment: 1 } } });
          }
        }
        received += response.report.list.length;
        await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { pages: page } });
        if (received >= total) break;
        if (!response.report.list.length || page === 10000) throw new ProviderError('INCOMPLETE_PAGINATION');
      }
      const current = await this.repo.db.reconciliationBatch.findUniqueOrThrow({ where: { id: batch.id } });
      await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: {
        status: current.failedRecords ? 'FAILED' : 'COMPLETED', completedAt: new Date(),
        errorCode: current.failedRecords ? 'BATCH_CONTAINS_FAILED_RECORDS' : null,
      } });
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'RECONCILIATION_FAILED';
      if (code === 'PROVIDER_AUTH_EXPIRED' && version !== undefined) await this.credentials.mark(version, 'EXPIRED');
      await this.repo.db.reconciliationBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', errorCode: code, completedAt: new Date() } });
    }
  }
}
