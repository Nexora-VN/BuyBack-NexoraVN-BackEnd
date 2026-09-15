import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FinanceModule } from '../finance/finance.module.js';
import { CredentialService } from './credential.service.js';
import { ReconciliationService } from './reconciliation.service.js';
import { AddLiveTagClient } from './addlivetag.client.js';
import { AddLiveTagEngine } from './addlivetag-engine.js';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => FinanceModule)],
  providers: [CredentialService, ReconciliationService, AddLiveTagClient, AddLiveTagEngine],
  exports: [CredentialService, ReconciliationService, AddLiveTagClient, AddLiveTagEngine],
})
export class ReconciliationModule {}
