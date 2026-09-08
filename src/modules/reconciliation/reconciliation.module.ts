import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FinanceModule } from '../finance/finance.module.js';
import { CredentialService } from './credential.service.js';
import { SaffiClient } from './saffi.client.js';
import { ReconciliationEngine } from './reconciliation-engine.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => FinanceModule)],
  providers: [CredentialService, SaffiClient, ReconciliationEngine, ReconciliationService],
  exports: [CredentialService, SaffiClient, ReconciliationEngine, ReconciliationService],
})
export class ReconciliationModule {}
