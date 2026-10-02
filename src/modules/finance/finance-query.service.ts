import {
  batchProviderSettlementBlockers,
  commissionSettlementBlockers,
} from './settlement-eligibility.js';
import { paymentBlockers } from '../reconciliation/commission-status.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinanceRepository } from './finance.repository.js';
import type { ListInput } from './finance.contract.js';
import { bankSelect } from './bank.service.js';
import type {
  CommissionState,
  WithdrawalState,
  BatchState,
} from '../../generated/prisma/client.js';

export type Resource =
  | 'orders'
  | 'commissions'
  | 'cashbacks'
  | 'withdrawals'
  | 'bank-accounts'
  | 'affiliate-links'
  | 'transactions'
  | 'batches'
  | 'issues'
  | 'settlements'
  | 'audit-logs';
const withdrawalSelect = {
  id: true,
  userId: true,
  amount: true,
  status: true,
  createdAt: true,
  transferReference: true,
  bank: { select: bankSelect },
} as const;
const sourceOrderSelect = {
  id: true,
  orderSn: true,
  provider: true,
  payload: true,
  items: { take: 1, select: { payload: true } },
} as const;
const sourceCheckoutSelect = {
  provider: true,
  orders: { orderBy: { createdAt: 'asc' }, select: sourceOrderSelect },
} as const;
type SourceOrder = {
  id: string;
  orderSn: string;
  provider: string;
  payload: unknown;
  items: { payload: unknown }[];
};
type SourceCheckout = { provider: string; orders: SourceOrder[] };
function orderSources(checkout: SourceCheckout | null) {
  return (checkout?.orders ?? []).map((order) => {
    const snapshot = Array.isArray(order.payload)
      ? (order.payload[0] as Record<string, unknown>)
      : null;
    const itemPayload = order.items[0]?.payload;
    const item =
      itemPayload && typeof itemPayload === 'object'
        ? (itemPayload as Record<string, unknown>)
        : null;
    const name = snapshot?.item_name ?? snapshot?.itemName ?? item?.item_name ?? item?.itemName;
    const affiliate = snapshot?.affiliate ?? item?.affiliate;
    const itemUrl = snapshot?.item_url ?? item?.item_url;
    return {
      id: order.id,
      orderSn: order.orderSn,
      platform: detectPlatform(
        order.provider || checkout?.provider,
        typeof affiliate === 'string' ? affiliate : undefined,
        typeof itemUrl === 'string' ? itemUrl : undefined,
      ),
      productName: typeof name === 'string' && name.trim() ? name.trim() : null,
    };
  });
}
function enumStatus<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new BadRequestException('INVALID_STATUS_FILTER');
  return value as T;
}

export function detectPlatform(provider?: string, affiliate?: string, url?: string): string {
  const text = `${provider ?? ''} ${affiliate ?? ''} ${url ?? ''}`.toLowerCase();
  if (text.includes('tiktok')) return 'TikTok Shop';
  if (text.includes('lazada')) return 'Lazada';
  if (
    text.includes('shopee') ||
    text.includes('shp.ee') ||
    (provider && provider.startsWith('ADDLIVETAG'))
  )
    return 'Shopee';
  return 'Shopee';
}

@Injectable()
export class FinanceQueryService {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly config: ConfigService,
  ) {}
  async list(resource: Resource, query: ListInput, userId?: string, batchId?: string) {
    const db = this.repo.db;
    const page = {
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: query.sort },
    };
    let data: unknown[], total: number;
    const search = query.search ? { contains: query.search } : undefined;
    switch (resource) {
      case 'orders': {
        const where = {
          ...(userId ? { checkout: { commission: { userId } } } : {}),
          ...(search ? { orderSn: search } : {}),
          ...(query.status
            ? {
                status: enumStatus(query.status, [
                  '1',
                  '2',
                  '3',
                  '4',
                  'VALIDATED',
                  'REJECTED',
                  'PARTIALLY_VALIDATED',
                  'MANUAL_REVIEW',
                ]),
              }
            : {}),
        };
        [data, total] = await Promise.all([
          db.providerOrder.findMany({
            ...page,
            where,
            select: {
              id: true,
              orderId: true,
              orderSn: true,
              provider: true,
              payload: true,
              status: true,
              createdAt: true,
              items: {
                select: {
                  id: true,
                  itemId: true,
                  payload: true,
                  status: true,
                  itemPriceRaw: true,
                  actualAmountRaw: true,
                  refundedAmountRaw: true,
                  scale: true,
                },
              },
              checkout: {
                select: {
                  purchasedAt: true,
                  conversionState: true,
                  commission: {
                    select: {
                      id: true,
                      state: true,
                      estimatedVnd: true,
                      settledVnd: true,
                      cashback: { select: { state: true, userAmount: true, userBps: true } },
                    },
                  },
                },
              },
            },
          }),
          db.providerOrder.count({ where }),
        ]);

        const orderRows = data as Array<{
          id: string;
          orderId: string;
          orderSn: string;
          provider: string;
          payload: unknown;
          status: string;
          createdAt: Date;
          items: Array<{
            id: string;
            itemId: string;
            payload: unknown;
            status: string;
            itemPriceRaw: bigint;
            actualAmountRaw: bigint;
            refundedAmountRaw: bigint;
            scale: number;
          }>;
          checkout: {
            purchasedAt: Date;
            conversionState: string;
            commission: {
              id: string;
              state: string;
              estimatedVnd: bigint;
              settledVnd: bigint;
              cashback: { state: string; userAmount: bigint; userBps?: number } | null;
            } | null;
          };
        }>;

        data = orderRows.map((row) => {
          const snapshots = Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>[])
            : [];

          let primaryItem: Record<string, unknown> | undefined;
          if (snapshots.length > 0 && snapshots[0]) {
            const firstSnapshot = snapshots[0];
            primaryItem = snapshots.reduce<Record<string, unknown>>((max, item) => {
              const maxVal = BigInt((max.order_value as string) || (max.price as string) || 0);
              const curVal = BigInt((item.order_value as string) || (item.price as string) || 0);
              return curVal > maxVal ? item : max;
            }, firstSnapshot);
          } else if (row.items && row.items.length > 0 && row.items[0]) {
            const first = row.items[0];
            const p = (first.payload as Record<string, unknown>) || {};
            primaryItem = {
              item_name: p.item_name || first.itemId,
              image: p.image || p.imageUrl || null,
              order_value: first.actualAmountRaw?.toString() || '0',
            };
          }

          const totalAmountVnd =
            snapshots.length > 0
              ? snapshots
                  .reduce(
                    (sum, item) =>
                      sum + BigInt((item.order_value as string) || (item.price as string) || 0),
                    0n,
                  )
                  .toString()
              : (row.items || [])
                  .reduce((sum, item) => sum + BigInt(item.actualAmountRaw || 0), 0n)
                  .toString();

          const platform = detectPlatform(
            row.provider,
            primaryItem?.affiliate as string | undefined,
            primaryItem?.item_url as string | undefined,
          );

          const productSummary = {
            name: (primaryItem?.item_name as string) || null,
            imageUrl: (primaryItem?.image as string) || null,
            itemCount: snapshots.length || (row.items?.length ?? 1),
            totalAmountVnd,
            platform,
          };

          return {
            ...row,
            productSummary,
            platform,
            totalAmountVnd,
          };
        });
        break;
      }
      case 'commissions': {
        const state = enumStatus<CommissionState>(query.status, [
          'ESTIMATED',
          'VALIDATED',
          'PAID',
          'REJECTED',
          'REVERSED',
          'MANUAL_REVIEW',
        ]);
        const where = {
          ...(userId ? { userId } : {}),
          ...(state ? { state } : {}),
          ...(search ? { checkout: { checkoutId: search } } : {}),
        };
        [data, total] = await Promise.all([
          db.commission.findMany({
            ...page,
            where,
            include: {
              checkout: true,
              settlementItem: true,
              cashback: true,
            },
          }),
          db.commission.count({ where }),
        ]);
        const checkoutRows = data as {
          checkout: { provider: string; accountId: string; checkoutId: string; payload?: unknown };
        }[];
        const providerBlockers = await batchProviderSettlementBlockers(
          db,
          checkoutRows.map((row) => row.checkout),
        );
        data = data.map((value) => {
          const row = value as Awaited<
            ReturnType<
              typeof db.commission.findMany<{
                include: { checkout: true; settlementItem: true; cashback: true };
              }>
            >
          >[number];
          const blockers = [
            ...commissionSettlementBlockers(row),
            ...(providerBlockers.get(`${row.checkout.provider}:${row.checkout.checkoutId}`) ?? []),
          ];
          const { checkout, settlementItem: _item, ...safe } = row;
          void _item;
          return {
            ...safe,
            checkout: {
              checkoutId: checkout.checkoutId,
              purchasedAt: checkout.purchasedAt,
              conversionState: checkout.conversionState,
              provider: checkout.provider,
            },
            settlementEligibility: { eligible: blockers.length === 0, blockers },
          };
        });
        break;
      }
      case 'cashbacks': {
        const state = enumStatus(query.status, [
          'PENDING',
          'VALIDATED',
          'AVAILABLE',
          'REJECTED',
          'REVERSED',
        ] as const);
        const where = {
          commission: {
            ...(userId ? { userId } : {}),
            ...(search
              ? {
                  checkout: {
                    OR: [{ checkoutId: search }, { orders: { some: { orderSn: search } } }],
                  },
                }
              : {}),
          },
          ...(state ? { state } : {}),
        };
        [data, total] = await Promise.all([
          db.cashbackAllocation.findMany({
            ...page,
            where,
            include: {
              commission: {
                select: {
                  id: true,
                  userId: true,
                  estimatedVnd: true,
                  settledVnd: true,
                  state: true,
                  checkout: { select: sourceCheckoutSelect },
                },
              },
            },
          }),
          db.cashbackAllocation.count({ where }),
        ]);
        data = data.map((value) => {
          const row = value as {
            commission: { checkout: SourceCheckout } & Record<string, unknown>;
          } & Record<string, unknown>;
          const { checkout, ...commission } = row.commission;
          const orders = orderSources(checkout);
          return {
            ...row,
            commission,
            source: { order: orders[0] ?? null, orders, withdrawal: null },
          };
        });
        break;
      }
      case 'withdrawals': {
        const status = enumStatus<WithdrawalState>(query.status, [
          'PENDING',
          'PROCESSING',
          'COMPLETED',
          'REJECTED',
          'FAILED',
        ]);
        const where = {
          ...(userId ? { userId } : {}),
          ...(status ? { status } : {}),
          ...(search ? { transferReference: search } : {}),
        };
        [data, total] = await Promise.all([
          db.withdrawal.findMany({ ...page, where, select: withdrawalSelect }),
          db.withdrawal.count({ where }),
        ]);
        break;
      }
      case 'bank-accounts': {
        const status = enumStatus(query.status, ['PENDING', 'APPROVED', 'REJECTED'] as const);
        const where = {
          deleteAt: null,
          ...(userId ? { userId } : {}),
          ...(status ? { status } : {}),
          ...(search ? { accountHolder: search } : {}),
        };
        [data, total] = await Promise.all([
          db.userBank.findMany({ ...page, where, select: bankSelect }),
          db.userBank.count({ where }),
        ]);
        break;
      }
      case 'affiliate-links': {
        const where = { userId, deleteAt: null, ...(search ? { originLink: search } : {}) };
        [data, total] = await Promise.all([
          db.affiliateLink.findMany({
            ...page,
            where,
            include: { product: { select: { productName: true, imageUrl: true } } },
          }),
          db.affiliateLink.count({ where }),
        ]);
        break;
      }
      case 'transactions': {
        const relatedReferences =
          search && userId
            ? await Promise.all([
                db.commission.findMany({
                  where: { userId, checkout: { orders: { some: { orderSn: search } } } },
                  select: { id: true },
                }),
                db.withdrawal.findMany({
                  where: { userId, transferReference: search },
                  select: { id: true },
                }),
              ]).then(([commissions, withdrawals]) => [
                ...commissions.map((row) => row.id),
                ...withdrawals.map((row) => row.id),
              ])
            : [];
        const where = {
          ...(userId ? { wallet: { userId } } : {}),
          ...(search
            ? { OR: [{ reference: search }, { reference: { in: relatedReferences } }] }
            : {}),
          ...(query.status ? { type: query.status } : {}),
        };
        [data, total] = await Promise.all([
          db.walletTransaction.findMany({ ...page, where }),
          db.walletTransaction.count({ where }),
        ]);
        const rows = data as { type: string; reference: string }[];
        const validId = (value: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
        const commissionIds = rows
          .filter((row) => row.type.startsWith('CASHBACK_') && validId(row.reference))
          .map((row) => row.reference);
        const withdrawalIds = rows
          .filter((row) => row.type.startsWith('WITHDRAWAL_') && validId(row.reference))
          .map((row) => row.reference);
        const [commissions, withdrawals] = await Promise.all([
          db.commission.findMany({
            where: { id: { in: commissionIds }, ...(userId ? { userId } : {}) },
            select: { id: true, checkout: { select: sourceCheckoutSelect } },
          }),
          db.withdrawal.findMany({
            where: { id: { in: withdrawalIds }, ...(userId ? { userId } : {}) },
            select: { id: true, bank: { select: { bankName: true, lastFour: true } } },
          }),
        ]);
        const ordersByCommission = new Map(
          commissions.map((row) => [row.id, orderSources(row.checkout)]),
        );
        const withdrawalsById = new Map(
          withdrawals.map((row) => [
            row.id,
            {
              id: row.id,
              bankName: row.bank.bankName,
              lastFour: row.bank.lastFour,
            },
          ]),
        );
        data = data.map((value) => {
          const row = value as { type: string; reference: string } & Record<string, unknown>;
          const orders = ordersByCommission.get(row.reference) ?? [];
          return {
            ...row,
            source: {
              order: orders[0] ?? null,
              orders,
              withdrawal: withdrawalsById.get(row.reference) ?? null,
            },
          };
        });
        break;
      }
      case 'batches': {
        const status = enumStatus<BatchState>(query.status, [
          'QUEUED',
          'RUNNING',
          'COMPLETED',
          'FAILED',
        ]);
        const where = { ...(status ? { status } : {}), ...(search ? { errorCode: search } : {}) };
        [data, total] = await Promise.all([
          db.reconciliationBatch.findMany({ ...page, where }),
          db.reconciliationBatch.count({ where }),
        ]);
        break;
      }
      case 'issues': {
        const status = enumStatus(query.status, ['OPEN', 'RESOLVED'] as const);
        const where = {
          ...(batchId ? { batchId } : {}),
          ...(status ? { status } : {}),
          ...(search ? { type: search } : {}),
        };
        [data, total] = await Promise.all([
          db.reconciliationIssue.findMany({ ...page, where }),
          db.reconciliationIssue.count({ where }),
        ]);
        break;
      }
      case 'settlements': {
        const status = enumStatus(query.status, ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const);
        const where = { ...(status ? { status } : {}), ...(search ? { reference: search } : {}) };
        [data, total] = await Promise.all([
          db.settlementBatch.findMany({ ...page, where }),
          db.settlementBatch.count({ where }),
        ]);
        break;
      }
      case 'audit-logs': {
        const where = search ? { action: search } : {};
        [data, total] = await Promise.all([
          db.auditLog.findMany({ ...page, where }),
          db.auditLog.count({ where }),
        ]);
        break;
      }
    }
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async order(id: string, userId?: string) {
    const row = await this.repo.db.providerOrder.findFirst({
      where: { id, ...(userId ? { checkout: { commission: { userId } } } : {}) },
      include: {
        items: true,
        checkout: { include: { commission: { include: { cashback: true } } } },
      },
    });
    if (!row) throw new NotFoundException('ORDER_NOT_FOUND');
    if (row.provider.startsWith('ADDLIVETAG:')) {
      const snapshots = Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>[])
        : [];
      const items = snapshots.map((item, index) => ({
        id: `${row.id}:${index}`,
        itemName: item.item_name,
        status: item.status_code,
        commissionStatus: item.commission_status,
        actualAmountRaw: item.order_value,
        itemPriceRaw: item.price,
        commissionVnd: item.commission,
        mcnFeeVnd: item.mcn_fee,
        scale: 1,
        itemUrl: item.item_url,
        image: item.image,
        qty: item.qty,
      }));
      const totalAmountVnd = snapshots
        .reduce(
          (sum, item) => sum + BigInt((item.order_value as string) || (item.price as string) || 0),
          0n,
        )
        .toString();
      const platform = detectPlatform(
        row.provider,
        snapshots[0]?.affiliate as string | undefined,
        snapshots[0]?.item_url as string | undefined,
      );
      const issues = userId
        ? undefined
        : await this.repo.db.reconciliationIssue.findMany({
            where: { provider: row.provider, checkoutId: row.checkout.checkoutId, status: 'OPEN' },
          });
      const blockers: string[] = paymentBlockers(row.checkout.payload);
      if (!userId) {
        const credential = await this.repo.db.providerCredential.findUnique({
          where: { id: 'ADDLIVETAG' },
        });
        if (
          !credential?.verifiedAt ||
          credential.status !== 'ACTIVE' ||
          credential.accountId !== row.checkout.accountId
        ) {
          blockers.push('ACCOUNT_UNIT_UNVERIFIED');
        }
        if (issues && issues.length > 0) {
          for (const issue of issues) blockers.push(issue.type);
        }
        if (row.checkout.conversionState !== 'VALIDATED') {
          blockers.push(`CONVERSION_STATE_${row.checkout.conversionState}`);
        }
        if (row.checkout.commission?.state !== 'VALIDATED') {
          blockers.push(`COMMISSION_STATE_${row.checkout.commission?.state ?? 'NONE'}`);
        }
        if (!row.checkout.commission?.userId) {
          blockers.push('NO_ATTRIBUTED_USER');
        }
      }
      return {
        id: row.id,
        orderSn: row.orderSn,
        status: row.status,
        provider: row.provider,
        platform,
        totalAmountVnd,
        items,
        checkout: userId
          ? {
              purchasedAt: row.checkout.purchasedAt,
              conversionState: row.checkout.conversionState,
              commission: row.checkout.commission && {
                state: row.checkout.commission.state,
                estimatedVnd: row.checkout.commission.estimatedVnd,
                settledVnd: row.checkout.commission.settledVnd,
                cashback: row.checkout.commission.cashback && {
                  state: row.checkout.commission.cashback.state,
                  userAmount: row.checkout.commission.cashback.userAmount,
                  userBps: row.checkout.commission.cashback.userBps,
                },
              },
            }
          : row.checkout,
        ...(userId
          ? {}
          : {
              issues,
              settlementEligibility: { eligible: blockers.length === 0, blockers },
              sourceSnapshot: row.payload,
            }),
      };
    }
    if (!userId) {
      const platform = detectPlatform(row.provider);
      const totalAmountVnd = row.items
        .reduce((sum, item) => sum + BigInt(item.actualAmountRaw || 0), 0n)
        .toString();
      return { ...row, platform, totalAmountVnd };
    }
    // Provider raw data contains account/traffic metadata, only expose financial and item fields to users.
    const { payload: _raw, checkout, items, ...order } = row;
    void _raw;
    const totalAmountVnd = items
      .reduce((sum, item) => sum + BigInt(item.actualAmountRaw || 0), 0n)
      .toString();
    const platform = detectPlatform(row.provider);
    return {
      ...order,
      platform,
      totalAmountVnd,
      items: items.map(({ payload, ...item }) => {
        const p = (payload as Record<string, unknown>) || {};
        return {
          ...item,
          itemName: (p.item_name as string) || (p.itemName as string) || item.itemId,
          image: (p.image as string) || (p.imageUrl as string) || null,
          itemUrl: (p.item_url as string) || (p.itemUrl as string) || null,
          qty: (p.qty as number) || 1,
        };
      }),
      checkout: {
        purchasedAt: checkout.purchasedAt,
        conversionState: checkout.conversionState,
        commission: checkout.commission && {
          state: checkout.commission.state,
          estimatedVnd: checkout.commission.estimatedVnd,
          settledVnd: checkout.commission.settledVnd,
          cashback: checkout.commission.cashback && {
            state: checkout.commission.cashback.state,
            userAmount: checkout.commission.cashback.userAmount,
            userBps: checkout.commission.cashback.userBps,
          },
        },
      },
    };
  }
  async wallet(userId: string) {
    const row = await this.repo.db.wallet.findUnique({ where: { userId } });
    return row ?? { userId, available: 0n, reserved: 0n };
  }
  async dashboard(userId?: string) {
    const db = this.repo.db;
    const [orders, commissions, wallet, allocations, operations] = await Promise.all([
      db.providerOrder.count({ where: userId ? { checkout: { commission: { userId } } } : {} }),
      db.commission.groupBy({
        by: ['state'],
        where: userId ? { userId } : {},
        _count: true,
        _sum: { estimatedVnd: true, settledVnd: true },
      }),
      userId
        ? this.wallet(userId)
        : db.wallet
            .aggregate({ _sum: { available: true, reserved: true } })
            .then((r) => ({ available: r._sum.available ?? 0n, reserved: r._sum.reserved ?? 0n })),
      db.cashbackAllocation.groupBy({
        by: ['state'],
        where: userId ? { commission: { userId } } : {},
        _count: true,
        _sum: { userAmount: true },
      }),
      userId
        ? Promise.resolve(undefined)
        : Promise.all([
            db.withdrawal.count({ where: { status: 'PENDING' } }),
            db.userBank.count({ where: { status: 'PENDING', deleteAt: null } }),
            db.reconciliationIssue.count({ where: { status: 'OPEN' } }),
          ]).then(([pendingWithdrawals, pendingBanks, openIssues]) => ({
            pendingWithdrawals,
            pendingBanks,
            openIssues,
          })),
    ]);
    return {
      orders,
      commissions,
      wallet,
      cashbackSummary: allocations.map((row) => ({
        state: row.state,
        userAmount: row._sum.userAmount ?? 0n,
        count: row._count,
      })),
      operations,
    };
  }
  async health() {
    const [credential, shopeeCredential, latestBatch, openIssues, running, failed, ledger, cached] =
      await Promise.all([
        this.repo.db.providerCredential.findUnique({
          where: { id: 'ADDLIVETAG' },
          select: {
            status: true,
            version: true,
            accountId: true,
            expectedAffiliate: true,
            verifiedAt: true,
            lastValidatedAt: true,
          },
        }),
        this.repo.db.providerCredential.findUnique({
          where: { id: 'SHOPEE' },
          select: {
            status: true,
            version: true,
            lastValidatedAt: true,
            updatedAt: true,
          },
        }),
        this.repo.db.reconciliationBatch.findFirst({
          where: { status: 'COMPLETED', provider: 'ADDLIVETAG' },
          orderBy: { completedAt: 'desc' },
        }),
        this.repo.db.reconciliationIssue.count({ where: { status: 'OPEN' } }),
        this.repo.db.reconciliationBatch.count({
          where: { provider: 'ADDLIVETAG', status: { in: ['QUEUED', 'RUNNING'] } },
        }),
        this.repo.db.reconciliationBatch.count({
          where: { provider: 'ADDLIVETAG', status: 'FAILED' },
        }),
        this.repo.db.walletTransaction.aggregate({
          _sum: { availableDelta: true, reservedDelta: true },
        }),
        this.repo.db.wallet.aggregate({ _sum: { available: true, reserved: true } }),
      ]);
    return {
      provider: 'ADDLIVETAG',
      credential,
      shopeeCredential,
      latestBatch,
      openIssues,
      queuedOrRunning: running,
      failedBatches: failed,
      syncLagSeconds: latestBatch?.completedAt
        ? Math.floor((Date.now() - latestBatch.completedAt.getTime()) / 1000)
        : null,
      ledgerBalanced:
        (ledger._sum.availableDelta ?? 0n) === (cached._sum.available ?? 0n) &&
        (ledger._sum.reservedDelta ?? 0n) === (cached._sum.reserved ?? 0n),
      features: {
        reconciliation: this.config.get<boolean>('RECONCILIATION_ENABLED'),
        settlement: this.config.get<boolean>('SETTLEMENT_ENABLED'),
        withdrawals: this.config.get<boolean>('WITHDRAWALS_ENABLED'),
      },
    };
  }
}
