import { correlation, event } from '../../common/observability/observability.js';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval } from '@nestjs/schedule';
import { createHash, randomUUID } from 'node:crypto';
import { FinanceRepository, audit, json } from '../finance/finance.repository.js';
import { CredentialService } from './credential.service.js';
import { ProviderError } from './provider-error.js';
import { AddLiveTagClient } from './addlivetag.client.js';
import { AddLiveTagEngine } from './addlivetag-engine.js';
import { splitDateRange, type ConversionItem } from './addlivetag.contract.js';

function vietnamDate(offset: number) {
  return new Date(Date.now() + 7 * 3600000 - offset * 86400000).toISOString().slice(0, 10);
}
@Injectable()
export class ReconciliationService {
  private readonly owner = randomUUID();
  private busy = false;
  private readonly logger = new Logger(ReconciliationService.name);
  constructor(
    private readonly repo: FinanceRepository,
    private readonly credentials: CredentialService,
    private readonly client: AddLiveTagClient,
    private readonly engine: AddLiveTagEngine,
    private readonly config: ConfigService,
  ) {}
  async enqueueRange(startDate: string, endDate: string, source: string, actor?: string) {
    let chunks: Array<{ startDate: string; endDate: string }>;
    try {
      chunks = splitDateRange(startDate, endDate, 90);
    } catch {
      throw new ConflictException('INVALID_DATE_RANGE');
    }
    const batches = [];
    for (const chunk of chunks) {
      batches.push(await this.enqueueSingle(chunk.startDate, chunk.endDate, source, actor));
    }
    return batches;
  }
  async enqueue(startDate: string, endDate: string, source: string, actor?: string) {
    let chunks: Array<{ startDate: string; endDate: string }>;
    try {
      chunks = splitDateRange(startDate, endDate, 90);
    } catch {
      throw new ConflictException('INVALID_DATE_RANGE');
    }
    if (chunks.length > 1) {
      const batches = await this.enqueueRange(startDate, endDate, source, actor);
      return batches[0]!;
    }
    return this.enqueueSingle(startDate, endDate, source, actor);
  }
  private async enqueueSingle(startDate: string, endDate: string, source: string, actor?: string) {
    const credential = await this.credentials.metadata();
    if (!credential?.accountId || !credential.expectedAffiliate)
      throw new ConflictException('CONFIGURE_PROVIDER_FIRST');
    return this.repo.transaction(async (tx) => {
      const where = {
        provider: 'ADDLIVETAG',
        accountId: credential.accountId,
        startDate,
        endDate,
        status: { in: ['QUEUED', 'RUNNING'] as ('QUEUED' | 'RUNNING')[] },
      };
      const existing = await tx.reconciliationBatch.findFirst({ where });
      if (existing) return existing;
      const row = await tx.reconciliationBatch.create({
        data: {
          startDate,
          endDate,
          source,
          createdBy: actor,
          provider: 'ADDLIVETAG',
          accountId: credential.accountId,
          expectedAffiliate: credential.expectedAffiliate,
          credentialVersion: credential.version,
        },
      });
      await audit(tx, actor ?? null, 'RECONCILIATION_QUEUED', row.id);
      return row;
    });
  }
  async retry(id: string, actor: string) {
    const row = await this.repo.db.reconciliationBatch.findUnique({ where: { id } });
    const credential = await this.credentials.metadata();
    if (
      !row ||
      row.status !== 'FAILED' ||
      row.provider !== 'ADDLIVETAG' ||
      row.accountId !== credential?.accountId
    )
      throw new ConflictException('ONLY_ACTIVE_ACCOUNT_FAILED_BATCH_CAN_RETRY');
    return this.enqueue(row.startDate, row.endDate, 'RETRY', actor);
  }
  @Cron('0 10 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async hourly() {
    if (this.config.get<boolean>('RECONCILIATION_ENABLED'))
      await this.enqueue(vietnamDate(6), vietnamDate(0), 'HOURLY');
  }
  @Cron('0 15 2 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async nightly() {
    if (this.config.get<boolean>('RECONCILIATION_ENABLED'))
      await this.enqueue(vietnamDate(89), vietnamDate(0), 'NIGHTLY');
  }
  @Interval(5000)
  async work() {
    if (this.busy) return;
    this.busy = true;
    let leaseId: string | undefined;
    try {
      const batch = await this.repo.db.reconciliationBatch.findFirst({
        where: { provider: 'ADDLIVETAG', status: { in: ['QUEUED', 'RUNNING'] } },
        orderBy: { createdAt: 'asc' },
      });
      if (!batch?.accountId) return;
      const key = `ADDLIVETAG_SYNC:${batch.accountId}`;
      const leased = await this.repo.transaction(async (tx) => {
        const lease = await tx.jobLease.findUnique({ where: { id: key } });
        if (lease && lease.expiresAt > new Date()) return false;
        await tx.jobLease.upsert({
          where: { id: key },
          create: { id: key, owner: this.owner, expiresAt: new Date(Date.now() + 300000) },
          update: { owner: this.owner, expiresAt: new Date(Date.now() + 300000) },
        });
        await tx.reconciliationBatch.updateMany({
          where: { provider: 'ADDLIVETAG', accountId: batch.accountId, status: 'RUNNING' },
          data: { status: 'FAILED', errorCode: 'WORKER_LEASE_EXPIRED', completedAt: new Date() },
        });
        return true;
      });
      if (!leased) return;
      leaseId = key;
      if (batch.status === 'QUEUED')
        await correlation.run({ jobId: batch.id }, async () => {
          const started = performance.now();
          event('log', 'job.started', { batchId: batch.id });
          await this.run(batch.id, key);
          const completed = await this.repo.db.reconciliationBatch.findUnique({
            where: { id: batch.id },
            select: { status: true },
          });
          event('log', 'job.completed', {
            batchId: batch.id,
            outcome: completed?.status,
            durationMs: Math.round(performance.now() - started),
          });
        });
    } catch (err) {
      event('error', 'reconciliation.worker.failed', {
        provider: 'ADDLIVETAG',
        jobId: this.owner,
        err,
      });
    } finally {
      if (leaseId)
        await this.repo.db.jobLease
          .deleteMany({ where: { id: leaseId, owner: this.owner } })
          .catch((err: unknown) =>
            event('error', 'reconciliation.lease.release_failed', { jobId: this.owner, err }),
          );
      this.busy = false;
    }
  }
  private async renew(id: string) {
    const count = await this.repo.db.jobLease.updateMany({
      where: { id, owner: this.owner, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() + 300000) },
    });
    if (!count.count) throw new ProviderError('WORKER_LEASE_LOST');
  }
  private async run(id: string, leaseId: string) {
    let version: number | undefined;
    try {
      const credential = await this.credentials.read();
      version = credential.version;
      const batch = await this.repo.db.reconciliationBatch.findUniqueOrThrow({ where: { id } });
      if (
        batch.accountId !== credential.accountId ||
        batch.credentialVersion !== version ||
        batch.expectedAffiliate !== credential.expectedAffiliate
      )
        throw new ProviderError('CREDENTIAL_CHANGED');
      await this.repo.db.reconciliationBatch.update({ where: { id }, data: { status: 'RUNNING' } });
      const groups = new Map<string, ConversionItem[]>(),
        seenPages = new Set<string>();
      let total: number | undefined,
        summary: string | undefined,
        received = 0,
        commission = 0n;
      for (let page = 1; page <= 10000; page++) {
        await this.renew(leaseId);
        const report = await this.client.report(
          credential.apiKey,
          credential.accountId,
          batch.startDate,
          batch.endDate,
          page,
        );
        await this.renew(leaseId);
        await this.credentials.mark(version, 'ACTIVE');
        const currentSummary = JSON.stringify(report.summary);
        if (total !== undefined && (total !== report.meta.total || summary !== currentSummary))
          throw new ProviderError('PAGINATION_TOTAL_CHANGED');
        total = report.meta.total;
        summary = currentSummary;
        const hash = createHash('sha256').update(JSON.stringify(report.data)).digest('hex');
        if (report.data.length && seenPages.has(hash)) throw new ProviderError('DUPLICATE_PAGE');
        seenPages.add(hash);
        await this.repo.transaction(async (tx) => {
          await tx.reconciliationPage.create({
            data: { batchId: id, page, hash, payload: json(report) },
          });
          for (const [position, row] of report.data.entries()) {
            const localDate = new Date(row.purchase_time * 1000 + 7 * 3600000)
              .toISOString()
              .slice(0, 10);
            if (localDate < batch.startDate || localDate > batch.endDate)
              throw new ProviderError('ROW_OUTSIDE_DATE_RANGE');
            await tx.conversionItemSnapshot.create({
              data: {
                batchId: id,
                page,
                position,
                checkoutId: row.checkout_id,
                orderSn: row.order_sn,
                payload: json(row),
              },
            });
          }
          await tx.reconciliationBatch.update({
            where: { id },
            data: { pages: page, summary: json(report.summary) },
          });
        });
        for (const row of report.data) {
          const group = groups.get(row.checkout_id) ?? [];
          group.push(row);
          groups.set(row.checkout_id, group);
          commission += BigInt(row.commission);
        }
        received += report.data.length;
        if (received > total) throw new ProviderError('PAGINATION_COUNT_MISMATCH');
        if (received === total) {
          if (commission !== BigInt(report.summary.estimated_total_commission))
            throw new ProviderError('SUMMARY_COMMISSION_MISMATCH');
          break;
        }
        if (!report.data.length || page === 10000) throw new ProviderError('INCOMPLETE_PAGINATION');
      }
      await this.renew(leaseId);
      // Publish the complete validated batch atomically. Failed batches never partially credit/update.
      await this.repo.transaction(async (tx) => {
        const lease = await tx.jobLease.findUniqueOrThrow({ where: { id: leaseId } });
        if (lease.owner !== this.owner || lease.expiresAt <= new Date())
          throw new ProviderError('WORKER_LEASE_LOST');
        await this.engine.publish(
          tx,
          {
            id,
            accountId: credential.accountId,
            expectedAffiliate: credential.expectedAffiliate,
            credentialVersion: version!,
          },
          groups,
        );
        await tx.reconciliationBatch.update({
          where: { id },
          data: { status: 'COMPLETED', records: received, completedAt: new Date() },
        });
      });
      this.logger.log({
        event: 'reconciliation.batch.completed',
        batchId: id,
        provider: 'ADDLIVETAG',
        records: received,
      });
    } catch (error) {
      event('error', 'job.failed', { err: error });
      const code = error instanceof ProviderError ? error.code : 'RECONCILIATION_FAILED';
      if (code === 'PROVIDER_AUTH_EXPIRED' && version !== undefined)
        await this.credentials.mark(version, 'EXPIRED');
      await this.repo.db.reconciliationBatch.update({
        where: { id },
        data: { status: 'FAILED', failedRecords: 1, errorCode: code, completedAt: new Date() },
      });
      this.logger.error({
        event: 'reconciliation.batch.failed',
        batchId: id,
        provider: 'ADDLIVETAG',
        code,
      });
    }
  }
}
