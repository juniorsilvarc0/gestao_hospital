/**
 * Bounded Context: Physician Payout (Repasse) — Fase 9.
 *
 * Trilha R-A: critérios CRUD + apuração mensal (BullMQ).
 * Trilha R-B: lifecycle (conferir/liberar/pagar/cancelar), folha de
 *             produção e reapuração após reversão de glosa (RN-REP-06).
 * Trilha R-C: front-end (não toca este arquivo).
 *
 * Providers/controllers de R-A são adicionados pela trilha R-A. R-B
 * mantém seus providers/controllers neste arquivo. Em caso de merge
 * conflict, juntar as listas — não substituir.
 *
 * TODO(R-B): se algo aqui mudar incompatível, abrir RFC; este módulo
 * agora hospeda os controllers `criterios.controller`, `apuracao.controller`,
 * `repasses.controller` e `folha.controller` lado a lado.
 */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { GlosasModule } from '../glosas/glosas.module';
import { QUEUE_REPASSE_APURAR } from '../../infrastructure/queues/queues.module';

// ─── Critérios (R-A) ───
import { CreateCriterioUseCase } from './application/criterios/create-criterio.use-case';
import { DeleteCriterioUseCase } from './application/criterios/delete-criterio.use-case';
import { GetCriterioUseCase } from './application/criterios/get-criterio.use-case';
import { ListCriteriosUseCase } from './application/criterios/list-criterios.use-case';
import { UpdateCriterioUseCase } from './application/criterios/update-criterio.use-case';
// ─── Apuração (R-A) ───
import { ApuracaoRunnerService } from './application/apuracao/apuracao-runner.service';
import { ApurarCompetenciaUseCase } from './application/apuracao/apurar-competencia.use-case';
import { GetJobStatusUseCase } from './application/apuracao/get-job-status.use-case';
// ─── Lifecycle (R-B) ───
import { CancelarRepasseUseCase } from './application/lifecycle/cancelar-repasse.use-case';
import { ConferirRepasseUseCase } from './application/lifecycle/conferir-repasse.use-case';
import { GetRepasseUseCase } from './application/lifecycle/get-repasse.use-case';
import { LiberarRepasseUseCase } from './application/lifecycle/liberar-repasse.use-case';
import { ListRepassesUseCase } from './application/lifecycle/list-repasses.use-case';
import { MarcarPagoUseCase } from './application/lifecycle/marcar-pago.use-case';
// ─── Folha (R-B) ───
import { GetFolhaPrestadorUseCase } from './application/folha/get-folha-prestador.use-case';
import { GetFolhaResumoUseCase } from './application/folha/get-folha-resumo.use-case';
// ─── Reapuração (R-B) ───
import { HandleGlosaResolvidaUseCase } from './application/reapuracao/handle-glosa-resolvida.use-case';
import { ReapurarContaUseCase } from './application/reapuracao/reapurar-conta.use-case';
// ─── Infra (R-A + R-B) ───
import { ApuracaoProcessor } from './infrastructure/apuracao.processor';
import { ApuracaoController } from './infrastructure/controllers/apuracao.controller';
import { CriteriosController } from './infrastructure/controllers/criterios.controller';
import { FolhaController } from './infrastructure/controllers/folha.controller';
import { RepassesController } from './infrastructure/controllers/repasses.controller';
import { GlosaResolvidaListener } from './infrastructure/listeners/glosa-resolvida.listener';
import { RepasseRepository } from './infrastructure/repasse.repository';

@Module({
  imports: [
    AuditoriaModule,
    GlosasModule,
    // BullMQ — `QueuesModule` (Global) já registrou a queue;
    // `BullModule.registerQueue` aqui apenas expõe `@InjectQueue` para
    // este módulo. Sem isso o Nest não resolve o token da queue.
    BullModule.registerQueue({ name: QUEUE_REPASSE_APURAR }),
  ],
  controllers: [
    // R-A
    CriteriosController,
    ApuracaoController,
    // R-B
    RepassesController,
    FolhaController,
  ],
  providers: [
    RepasseRepository,
    // Critérios (R-A)
    ListCriteriosUseCase,
    GetCriterioUseCase,
    CreateCriterioUseCase,
    UpdateCriterioUseCase,
    DeleteCriterioUseCase,
    // Apuração (R-A)
    ApuracaoRunnerService,
    ApurarCompetenciaUseCase,
    GetJobStatusUseCase,
    ApuracaoProcessor,
    // Lifecycle (R-B)
    ListRepassesUseCase,
    GetRepasseUseCase,
    ConferirRepasseUseCase,
    LiberarRepasseUseCase,
    MarcarPagoUseCase,
    CancelarRepasseUseCase,
    // Folha (R-B)
    GetFolhaResumoUseCase,
    GetFolhaPrestadorUseCase,
    // Reapuração (R-B)
    HandleGlosaResolvidaUseCase,
    ReapurarContaUseCase,
    // Listeners (R-B)
    GlosaResolvidaListener,
  ],
  exports: [RepasseRepository],
})
export class RepasseModule {}
