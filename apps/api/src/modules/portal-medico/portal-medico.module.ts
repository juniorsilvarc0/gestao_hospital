/**
 * Bounded Context: Portal do Médico — Fase 11 / Trilha R-A.
 *
 * Read-only views agregadas para o médico autenticado. Todos os
 * endpoints vivem em `/v1/portal/medico`.
 *
 * Decisões registradas (relatório do agente):
 *   - REUSO: importamos `AgendamentoModule` e `RepasseModule` (ambos
 *     exportam seus repositórios) para reaproveitar listagens e
 *     lookups por prestador.
 *   - QUERIES PRÓPRIAS: como `ExamesModule` NÃO exporta o
 *     `ExamesRepository` e a leitura "OR equipe" para cirurgias não
 *     existe no `CentroCirurgicoRepository`, escrevemos as queries
 *     necessárias em `PortalMedicoRepository` via `prisma.tx().$queryRaw`.
 *     Isso evita modificar módulos de outras trilhas.
 *   - GUARD: `MedicoOnlyGuard` (escopo do controller) garante que o
 *     usuário tem `prestador_id` e não é PACIENTE antes de qualquer
 *     use case rodar.
 *   - PERMISSÕES: cada endpoint declara
 *     `@RequirePermission('portal_medico', '<acao>')` — granularidade
 *     conforme migration P0 (read | agenda | laudos | producao).
 */
import { Module } from '@nestjs/common';

import { AgendamentoModule } from '../agendamento/agendamento.module';
import { RepasseModule } from '../repasse/repasse.module';

import { GetAgendaUseCase } from './application/get-agenda.use-case';
import { GetCirurgiasAgendadasUseCase } from './application/get-cirurgias-agendadas.use-case';
import { GetDashboardMedicoUseCase } from './application/get-dashboard-medico.use-case';
import { GetLaudosPendentesUseCase } from './application/get-laudos-pendentes.use-case';
import { GetMeUseCase } from './application/get-me.use-case';
import { GetProducaoUseCase } from './application/get-producao.use-case';
import { GetRepasseMedicoUseCase } from './application/get-repasse-medico.use-case';
import { ListRepassesMedicoUseCase } from './application/list-repasses-medico.use-case';
import { PortalMedicoController } from './infrastructure/controllers/portal-medico.controller';
import { MedicoOnlyGuard } from './infrastructure/medico-only.guard';
import { PortalMedicoRepository } from './infrastructure/portal-medico.repository';

@Module({
  imports: [AgendamentoModule, RepasseModule],
  controllers: [PortalMedicoController],
  providers: [
    PortalMedicoRepository,
    MedicoOnlyGuard,
    // Use cases
    GetMeUseCase,
    GetAgendaUseCase,
    GetLaudosPendentesUseCase,
    GetProducaoUseCase,
    ListRepassesMedicoUseCase,
    GetRepasseMedicoUseCase,
    GetCirurgiasAgendadasUseCase,
    GetDashboardMedicoUseCase,
  ],
})
export class PortalMedicoModule {}
