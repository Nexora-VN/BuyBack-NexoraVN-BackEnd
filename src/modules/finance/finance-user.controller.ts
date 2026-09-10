import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
type SchemaObject = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.js';
import { FinanceQueryService } from './finance-query.service.js';
import { BankService } from './bank.service.js';
import { WithdrawalService } from './withdrawal.service.js';
import { bankInput, listInput, validate, withdrawalInput } from './finance.contract.js';
@ApiTags('finance-user')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('me')
export class FinanceUserController {
  constructor(
    private readonly queries: FinanceQueryService,
    private readonly banks: BankService,
    private readonly withdrawals: WithdrawalService,
  ) {}

  @Get('orders')
  list0(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('orders', validate(listInput, query), actor.id);
  }

  @Get('cashbacks')
  list1(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('cashbacks', validate(listInput, query), actor.id);
  }

  @Get('withdrawals')
  list2(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('withdrawals', validate(listInput, query), actor.id);
  }

  @Get('bank-accounts')
  list3(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('bank-accounts', validate(listInput, query), actor.id);
  }

  @Get('affiliate-links')
  list4(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('affiliate-links', validate(listInput, query), actor.id);
  }

  @Get('wallet/transactions')
  list5(@Query() query: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.list('transactions', validate(listInput, query), actor.id);
  }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.queries.order(id, actor.id);
  }
  @Get('wallet')
  wallet(@CurrentUser() actor: AuthenticatedUser) {
    return this.queries.wallet(actor.id);
  }
  @Get('dashboard')
  dashboard(@CurrentUser() actor: AuthenticatedUser) {
    return this.queries.dashboard(actor.id);
  }
  @Post('bank-accounts')
  @ApiBody({ schema: z.toJSONSchema(bankInput) as SchemaObject })
  bank(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.banks.save(actor.id, validate(bankInput, body));
  }
  @Patch('bank-accounts/:id')
  @ApiBody({ schema: z.toJSONSchema(bankInput) as SchemaObject })
  updateBank(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.banks.save(actor.id, validate(bankInput, body), id);
  }
  @Delete('bank-accounts/:id')
  removeBank(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.banks.remove(actor.id, id);
  }
  @Post('withdrawals')
  @ApiBody({ schema: z.toJSONSchema(withdrawalInput) as SchemaObject })
  withdraw(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.withdrawals.create(actor.id, validate(withdrawalInput, body));
  }
}
