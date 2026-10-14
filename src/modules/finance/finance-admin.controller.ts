import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../../common/throttling/rate-limits.js';
import { UserRole } from '../../common/domain/enums.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { FinanceQueryService } from './finance-query.service.js';
import { FinanceRepository } from './finance.repository.js';
import { BankService } from './bank.service.js';
import { SettlementService } from './settlement.service.js';
import { WithdrawalService } from './withdrawal.service.js';
import {
  adjustmentInput,
  listInput,
  policyInput,
  reason,
  settlementInput,
  validate,
  withdrawalStatusInput,
} from './finance.contract.js';
import { CredentialService } from '../reconciliation/credential.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import {
  providerInput,
  verificationInput,
  reviewInput,
  syncRangeInput,
} from '../reconciliation/addlivetag.contract.js';
import { AddLiveTagEngine } from '../reconciliation/addlivetag-engine.js';
type SchemaObject = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
const schema = (s: z.ZodType) => ({ schema: z.toJSONSchema(s) as SchemaObject });
const cookieInput = z.object({ cookie: z.string().min(10).max(32000) });
const reasonInput = z.object({ reason });
@ApiTags('finance-admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class FinanceAdminController {
  constructor(
    private readonly queries: FinanceQueryService,
    private readonly repo: FinanceRepository,
    private readonly banks: BankService,
    private readonly settlements: SettlementService,
    private readonly withdrawals: WithdrawalService,
    private readonly credentials: CredentialService,
    private readonly sync: ReconciliationService,
    private readonly addLiveTag: AddLiveTagEngine,
  ) {}

  @Get('orders')
  list0(@Query() query: unknown) {
    return this.queries.list('orders', validate(listInput, query));
  }

  @Get('commissions')
  list1(@Query() query: unknown) {
    return this.queries.list('commissions', validate(listInput, query));
  }

  @Get('cashbacks')
  list2(@Query() query: unknown) {
    return this.queries.list('cashbacks', validate(listInput, query));
  }

  @Get('withdrawals')
  list3(@Query() query: unknown) {
    return this.queries.list('withdrawals', validate(listInput, query));
  }

  @Get('bank-accounts')
  list4(@Query() query: unknown) {
    return this.queries.list('bank-accounts', validate(listInput, query));
  }

  @Get('wallet/transactions')
  list5(@Query() query: unknown) {
    return this.queries.list('transactions', validate(listInput, query));
  }

  @Get('reconciliation/batches')
  list6(@Query() query: unknown) {
    return this.queries.list('batches', validate(listInput, query));
  }

  @Get('reconciliation/issues')
  list7(@Query() query: unknown) {
    return this.queries.list('issues', validate(listInput, query));
  }

  @Get('settlements')
  list8(@Query() query: unknown) {
    return this.queries.list('settlements', validate(listInput, query));
  }

  @Get('audit-logs')
  list9(@Query() query: unknown) {
    return this.queries.list('audit-logs', validate(listInput, query));
  }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.order(id);
  }
  @Get('dashboard')
  dashboard() {
    return this.queries.dashboard();
  }
  @Get('provider-health')
  health() {
    return this.queries.health();
  }
  @Get('provider-credential')
  @Roles(UserRole.SUPER_ADMIN)
  credential() {
    return this.credentials.metadata();
  }
  @Get('provider-credential/shopee')
  @Roles(UserRole.SUPER_ADMIN)
  shopeeCredential() {
    return this.credentials.shopeeMetadata();
  }
  @Put('provider-credential/shopee')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(cookieInput))
  rotateShopee(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.credentials.rotateShopee(validate(cookieInput, body).cookie, actor.id);
  }
  @Put('provider-credential')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(z.union([providerInput, cookieInput])))
  rotate(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const cookieParsed = cookieInput.safeParse(body);
    if (cookieParsed.success) {
      return this.credentials.rotateShopee(cookieParsed.data.cookie, actor.id);
    }
    return this.credentials.rotate(validate(providerInput, body), actor.id);
  }
  @Post('provider-credential/verify')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(verificationInput))
  verifyProvider(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.credentials.verify(validate(verificationInput, body), actor.id);
  }
  @Post('reconciliation/sync')
  @Throttle({ default: RATE_LIMITS.sync })
  @ApiBody(schema(syncRangeInput))
  enqueue(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const input = validate(syncRangeInput, body);
    return this.sync.enqueueRange(input.startDate, input.endDate, 'MANUAL', actor.id);
  }
  @Get('reconciliation/batches/:id')
  async batch(@Param('id', ParseUUIDPipe) id: string) {
    const batch = await this.repo.db.reconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
    return batch;
  }
  @Get('reconciliation/batches/:id/items')
  async batchItems(@Param('id', ParseUUIDPipe) id: string, @Query('page') rawPage?: string) {
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(rawPage) || 1)));
    const batch = await this.repo.db.reconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
    const where = { batchId: id };
    const [snapshots, total] = await Promise.all([
      this.repo.db.conversionItemSnapshot.findMany({
        where,
        orderBy: [{ page: 'asc' }, { position: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      this.repo.db.conversionItemSnapshot.count({ where }),
    ]);
    const checkouts = await this.repo.db.providerCheckout.findMany({
      where: {
        provider: `ADDLIVETAG:${batch.accountId}`,
        checkoutId: { in: [...new Set(snapshots.map((item) => item.checkoutId))] },
      },
      select: {
        checkoutId: true,
        revision: true,
        conversionState: true,
        commission: { select: { user: { select: { id: true, email: true, displayName: true } } } },
      },
    });
    const byCheckout = new Map(checkouts.map((checkout) => [checkout.checkoutId, checkout]));
    return {
      data: snapshots.map((snapshot) => ({
        id: snapshot.id,
        checkoutId: snapshot.checkoutId,
        orderSn: snapshot.orderSn,
        ...(snapshot.payload as Record<string, unknown>),
        conversionState: byCheckout.get(snapshot.checkoutId)?.conversionState ?? null,
        user: byCheckout.get(snapshot.checkoutId)?.commission?.user ?? null,
      })),
      meta: { page, limit: 20, total, totalPages: Math.ceil(total / 20) },
    };
  }
  @Get('reconciliation/batches/:id/issues')
  batchIssues(@Param('id', ParseUUIDPipe) id: string, @Query() query: unknown) {
    return this.queries.list('issues', validate(listInput, query), undefined, id);
  }
  @Get('reconciliation/issues/:id/context')
  async issueContext(@Param('id', ParseUUIDPipe) id: string) {
    const issue = await this.repo.db.reconciliationIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('ISSUE_NOT_FOUND');
    const checkout = issue.checkoutId
      ? await this.repo.db.providerCheckout.findUnique({
          where: {
            provider_checkoutId: { provider: issue.provider, checkoutId: issue.checkoutId },
          },
          select: {
            checkoutId: true,
            revision: true,
            sourceHash: true,
            rawStatus: true,
            conversionState: true,
            netRaw: true,
            payload: true,
            commission: {
              select: {
                state: true,
                estimatedVnd: true,
                affiliateLinkId: true,
                user: { select: { id: true, email: true, displayName: true } },
              },
            },
          },
        })
      : null;
    const currentLink = checkout?.commission?.affiliateLinkId
      ? await this.repo.db.affiliateLink.findUnique({
          where: { id: checkout.commission.affiliateLinkId },
          select: {
            id: true,
            user: { select: { id: true, email: true, displayName: true } },
            product: { select: { productName: true, imageUrl: true } },
          },
        })
      : null;
    return {
      issue: {
        id: issue.id,
        type: issue.type,
        status: issue.status,
        resolution: issue.resolution,
        checkoutId: issue.checkoutId,
        sourceHash: issue.sourceHash,
      },
      checkout: checkout && {
        ...checkout,
        netRaw: checkout.netRaw.toString(),
        items: Array.isArray(checkout.payload) ? checkout.payload : [],
        payload: undefined,
      },
      currentLink,
    };
  }
  @Get('reconciliation/issues/:id/affiliate-links')
  async issueAffiliateLinks(@Param('id', ParseUUIDPipe) id: string, @Query('search') search = '') {
    const issue = await this.repo.db.reconciliationIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('ISSUE_NOT_FOUND');
    const term = search.trim().slice(0, 100);
    if (term.length < 2) return { data: [] };
    const links = await this.repo.db.affiliateLink.findMany({
      where: {
        deleteAt: null,
        OR: [
          { user: { email: { contains: term, mode: 'insensitive' } } },
          { user: { displayName: { contains: term, mode: 'insensitive' } } },
          { product: { productName: { contains: term, mode: 'insensitive' } } },
          { subId4: { contains: term } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } },
        product: { select: { productName: true, imageUrl: true } },
      },
    });
    return { data: links };
  }
  @Post('reconciliation/batches/:id/retry')
  @Throttle({ default: RATE_LIMITS.sync })
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sync.retry(id, actor.id);
  }
  @Post('reconciliation/issues/:id/resolve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(reviewInput))
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.addLiveTag.review(id, validate(reviewInput, body), actor.id);
  }
  @Post('settlements')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(settlementInput))
  createSettlement(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.settlements.create(validate(settlementInput, body), actor.id);
  }
  @Get('settlements/:id')
  async settlement(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.repo.db.settlementBatch.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            commission: {
              include: {
                user: { select: { id: true, email: true, displayName: true } },
                checkout: {
                  select: {
                    checkoutId: true,
                    payload: true,
                    orders: { select: { orderSn: true }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!result) throw new NotFoundException('SETTLEMENT_NOT_FOUND');
    return {
      ...result,
      items: result.items.map((item) => {
        const first = Array.isArray(item.commission.checkout.payload)
          ? (item.commission.checkout.payload[0] as Record<string, unknown> | undefined)
          : undefined;
        return {
          ...item,
          source: {
            orderSn: item.commission.checkout.orders[0]?.orderSn ?? null,
            productName: typeof first?.item_name === 'string' ? first.item_name : null,
            imageUrl: typeof first?.image === 'string' ? first.image : null,
            user: item.commission.user,
          },
          commission: { ...item.commission, checkout: undefined },
        };
      }),
    };
  }
  @Post('settlements/:id/confirm')
  @Roles(UserRole.SUPER_ADMIN)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.settlements.confirm(id, actor.id);
  }
  @Post('settlements/:id/cancel')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(reasonInput))
  cancelSettlement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.settlements.cancel(id, actor.id, validate(reasonInput, body).reason);
  }
  @Post('bank-accounts/:id/approve')
  @ApiBody(schema(reasonInput))
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.banks.review(id, actor.id, true, validate(reasonInput, body).reason);
  }
  @Post('bank-accounts/:id/reject')
  @ApiBody(schema(reasonInput))
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.banks.review(id, actor.id, false, validate(reasonInput, body).reason);
  }
  @Patch('withdrawals/:id/status')
  @ApiBody(schema(withdrawalStatusInput))
  withdrawalStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.withdrawals.transition(id, actor.id, validate(withdrawalStatusInput, body));
  }
  @Post('withdrawals/:id/payment-details')
  reveal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.withdrawals.paymentDetails(id, actor.id);
  }
  @Post('wallet-adjustments')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(adjustmentInput))
  adjust(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.withdrawals.adjust(actor.id, validate(adjustmentInput, body));
  }
  @Get('policy')
  async policy() {
    return (
      (await this.repo.db.affiliatePolicy.findUnique({ where: { id: 1 } })) ?? {
        id: 1,
        userBps: 8000,
        minWithdrawal: '10000',
      }
    );
  }

  @Put('policy')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBody(schema(policyInput))
  async updatePolicy(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const input = validate(policyInput, body);
    const updated = await this.repo.db.affiliatePolicy.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        userBps: input.userBps,
        minWithdrawal: input.minWithdrawal ? BigInt(input.minWithdrawal) : 10000n,
      },
      update: {
        userBps: input.userBps,
        ...(input.minWithdrawal ? { minWithdrawal: BigInt(input.minWithdrawal) } : {}),
      },
    });
    await this.repo.db.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'POLICY_UPDATED',
        reference: 'policy:1',
        metadata: {
          userBps: input.userBps,
          ratePercent: `${input.userBps / 100}%`,
          minWithdrawal: updated.minWithdrawal.toString(),
        },
      },
    });
    return updated;
  }
}
