import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FinanceAdminController } from './finance-admin.controller.js';
import { FinanceUserController } from './finance-user.controller.js';
import { FinanceRepository } from './finance.repository.js';
import { FinanceCrypto } from './crypto.service.js';
import { WalletService } from './wallet.service.js';
import { BankService } from './bank.service.js';
import { SettlementService } from './settlement.service.js';
import { WithdrawalService } from './withdrawal.service.js';
import { FinanceQueryService } from './finance-query.service.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';

@Module({
  imports: [AuthModule, forwardRef(() => ReconciliationModule)],
  controllers: [FinanceAdminController, FinanceUserController],
  providers: [
    FinanceRepository,
    FinanceCrypto,
    WalletService,
    BankService,
    SettlementService,
    WithdrawalService,
    FinanceQueryService,
  ],
  exports: [
    FinanceRepository,
    FinanceCrypto,
    WalletService,
    BankService,
    SettlementService,
    WithdrawalService,
    FinanceQueryService,
  ],
})
export class FinanceModule {}
