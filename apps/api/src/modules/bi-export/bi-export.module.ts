/**
 * Bounded Context: BI Export — Fase 12 / Trilha R-B.
 *
 * Endpoint genérico que serializa qualquer MV permitida (allowlist) em
 * CSV ou XLSX. Permission `bi:export`. Multi-tenancy via
 * `BiRepository.requireTenantId()`.
 *
 * Allowlist em `application/views-allowlist.ts`. Adicionar nova view
 * exige update + teste.
 */
import { Module } from '@nestjs/common';

import { BiModule } from '../bi/bi.module';

import { ExportCsvUseCase } from './application/export-csv.use-case';
import { ExportXlsxUseCase } from './application/export-xlsx.use-case';
import { BiExportController } from './infrastructure/controllers/bi-export.controller';

@Module({
  imports: [BiModule],
  controllers: [BiExportController],
  providers: [ExportCsvUseCase, ExportXlsxUseCase],
})
export class BiExportModule {}
