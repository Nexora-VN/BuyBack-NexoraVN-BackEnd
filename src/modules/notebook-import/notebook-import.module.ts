import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotebookAnalyzerService } from './notebook-analyzer.service.js';
import { NotebookImportController } from './notebook-import.controller.js';
import { NotebookImportService } from './notebook-import.service.js';
import { NotebookStorageService } from './notebook-storage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotebookImportController],
  providers: [NotebookStorageService, NotebookAnalyzerService, NotebookImportService],
})
export class NotebookImportModule {}
