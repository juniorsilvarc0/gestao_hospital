/**
 * Bounded Context: Disallowance (Glosa) — Fase 8 (Trilha R-C).
 *
 * Entrega:
 *   - Glosa manual (RN-GLO-02) e importação TISS (RN-GLO-01) com inferência
 *     automática de motivo (RN-GLO-06).
 *   - Recurso de glosa com prazo (RN-GLO-03) e ciclo completo até estado
 *     terminal (REVERTIDA_TOTAL/PARCIAL, ACATADA, PERDA_DEFINITIVA).
 *   - Trigger DB `tg_glosa_atualiza_conta` mantém valor_glosa /
 *     valor_recurso_revertido coerentes na conta (RN-GLO-04).
 *   - Dashboard com KPIs e buckets de prazo D-7/D-3/D-0 (RN-GLO-03).
 *   - Eventos `glosa.recebida` / `glosa.recurso_resolvido` via
 *     EventEmitter2 — Fase 9 (Repasse) consome para reapurar.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CreateGlosaManualUseCase } from './application/create-glosa-manual.use-case';
import { CreateRecursoUseCase } from './application/create-recurso.use-case';
import { FinalizarGlosaUseCase } from './application/finalizar-glosa.use-case';
import { GetDashboardUseCase } from './application/get-dashboard.use-case';
import { GetGlosaUseCase } from './application/get-glosa.use-case';
import { ImportarGlosasTissUseCase } from './application/importar-glosas-tiss.use-case';
import { ListGlosasUseCase } from './application/list-glosas.use-case';
import { GlosasController } from './infrastructure/controllers/glosas.controller';
import { GlosasRepository } from './infrastructure/glosas.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [GlosasController],
  providers: [
    GlosasRepository,
    ListGlosasUseCase,
    GetGlosaUseCase,
    CreateGlosaManualUseCase,
    ImportarGlosasTissUseCase,
    CreateRecursoUseCase,
    FinalizarGlosaUseCase,
    GetDashboardUseCase,
  ],
  exports: [
    GlosasRepository,
    // Fase 11 R-B (Webhooks) reusa para o pipeline TISS retorno.
    ImportarGlosasTissUseCase,
  ],
})
export class GlosasModule {}
