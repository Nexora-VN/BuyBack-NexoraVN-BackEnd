import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { UserRole } from '../../common/domain/enums.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { FinanceQueryService } from './finance-query.service.js';
import { FinanceRepository, audit } from './finance.repository.js';
import { BankService } from './bank.service.js';
import { SettlementService } from './settlement.service.js';
import { WithdrawalService } from './withdrawal.service.js';
import { adjustmentInput, listInput, reason, settlementInput, validate, withdrawalStatusInput } from './finance.contract.js';
import { CredentialService } from '../reconciliation/credential.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { syncInput } from '../reconciliation/saffi.contract.js';
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
  constructor(private readonly queries: FinanceQueryService, private readonly repo: FinanceRepository,
    private readonly banks: BankService, private readonly settlements: SettlementService,
    private readonly withdrawals: WithdrawalService, private readonly credentials: CredentialService,
    private readonly sync: ReconciliationService) {}

  @Get('orders')
  list0(@Query() query: unknown) { return this.queries.list('orders', validate(listInput, query)); }

  @Get('commissions')
  list1(@Query() query: unknown) { return this.queries.list('commissions', validate(listInput, query)); }

  @Get('cashbacks')
  list2(@Query() query: unknown) { return this.queries.list('cashbacks', validate(listInput, query)); }

  @Get('withdrawals')
  list3(@Query() query: unknown) { return this.queries.list('withdrawals', validate(listInput, query)); }

  @Get('bank-accounts')
  list4(@Query() query: unknown) { return this.queries.list('bank-accounts', validate(listInput, query)); }

  @Get('wallet/transactions')
  list5(@Query() query: unknown) { return this.queries.list('transactions', validate(listInput, query)); }

  @Get('reconciliation/batches')
  list6(@Query() query: unknown) { return this.queries.list('batches', validate(listInput, query)); }

  @Get('reconciliation/issues')
  list7(@Query() query: unknown) { return this.queries.list('issues', validate(listInput, query)); }

  @Get('settlements')
  list8(@Query() query: unknown) { return this.queries.list('settlements', validate(listInput, query)); }

  @Get('audit-logs')
  list9(@Query() query: unknown) { return this.queries.list('audit-logs', validate(listInput, query)); }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) { return this.queries.order(id); }
  @Get('dashboard')
  dashboard() { return this.queries.dashboard(); }
  @Get('provider-health')
  health() { return this.queries.health(); }
  @Get('provider-credential')
  @Roles(UserRole.SUPER_ADMIN)
  credential() { return this.credentials.metadata(); }
  @Put('provider-credential')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(cookieInput))
  rotate(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.credentials.rotate(validate(cookieInput, body).cookie, actor.id);
  }
  @Post('reconciliation/sync')
  @ApiBody(schema(syncInput))
  enqueue(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const input = validate(syncInput, body);
    return this.sync.enqueue(input.startDate, input.endDate, 'MANUAL', actor.id);
  }
  @Get('reconciliation/batches/:id')
  async batch(@Param('id', ParseUUIDPipe) id: string) {
    const batch = await this.repo.db.reconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('BATCH_NOT_FOUND');
    return batch;
  }
  @Get('reconciliation/batches/:id/issues')
  batchIssues(@Param('id', ParseUUIDPipe) id: string, @Query() query: unknown) {
    return this.queries.list('issues', validate(listInput, query), undefined, id);
  }
  @Post('reconciliation/batches/:id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.sync.retry(id, actor.id); }
  @Post('reconciliation/issues/:id/resolve')
  @ApiBody(schema(reasonInput))
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const input = validate(reasonInput, body);
    return this.repo.transaction(async tx => {
      const issue = await tx.reconciliationIssue.findUnique({ where: { id } });
      if (!issue) throw new NotFoundException('ISSUE_NOT_FOUND');
      if (issue.status === 'RESOLVED') return issue;
      // Resolution acknowledges the investigation; only a new provider sync may validate the commission.
      const result = await tx.reconciliationIssue.update({ where: { id }, data: { status: 'RESOLVED',
        resolution: input.reason, resolvedBy: actor.id, resolvedAt: new Date() } });
      await audit(tx, actor.id, 'ISSUE_RESOLVED', id, { reason: input.reason });
      return result;
    });
  }
  @Post('settlements')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(settlementInput))
  createSettlement(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.settlements.create(validate(settlementInput, body), actor.id);
  }
  @Get('settlements/:id')
  async settlement(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.repo.db.settlementBatch.findUnique({ where: { id }, include: { items: { include: { commission: true } } } });
    if (!result) throw new NotFoundException('SETTLEMENT_NOT_FOUND');
    return result;
  }
  @Post('settlements/:id/confirm')
  @Roles(UserRole.SUPER_ADMIN)
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.settlements.confirm(id, actor.id); }
  @Post('settlements/:id/cancel')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(reasonInput))
  cancelSettlement(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.settlements.cancel(id, actor.id, validate(reasonInput, body).reason);
  }
  @Post('bank-accounts/:id/approve')
  @ApiBody(schema(reasonInput))
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.banks.review(id, actor.id, true, validate(reasonInput, body).reason);
  }
  @Post('bank-accounts/:id/reject')
  @ApiBody(schema(reasonInput))
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.banks.review(id, actor.id, false, validate(reasonInput, body).reason);
  }
  @Patch('withdrawals/:id/status')
  @ApiBody(schema(withdrawalStatusInput))
  withdrawalStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.withdrawals.transition(id, actor.id, validate(withdrawalStatusInput, body));
  }
  @Post('withdrawals/:id/payment-details')
  reveal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.withdrawals.paymentDetails(id, actor.id); }
  @Post('wallet-adjustments')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBody(schema(adjustmentInput))
  adjust(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.withdrawals.adjust(actor.id, validate(adjustmentInput, body)); }
  @Get('policy')
  async policy() { return await this.repo.db.affiliatePolicy.findUnique({ where: { id: 1 } }) ?? { id: 1, userBps: 8500, minWithdrawal: '50000' }; }
}
