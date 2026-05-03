/**
 * Bounded Context: Scheduling.
 *
 * Trilha A: CRUD de recursos/disponibilidade/bloqueios + cálculo de
 * slots + ciclo de vida de agendamentos (criar/reagendar/cancelar/
 * confirmar/checkin/no-show) + EXCLUDE constraint anti-overbooking.
 *
 * Trilha B: notificações (NotificacaoService, ConfirmacaoWorker,
 * NoShowWorker), teleconsulta (DailyCoService, TeleconsultaController +
 * TeleconsultaLinkService), scheduler de jobs.
 *
 * `NotificacaoService` e `DailyCoService` são exportados para que outros
 * bounded contexts (futuros) consumam.
 */
import { Module } from '@nestjs/common';

// Controllers — Trilha A
import { AgendamentoController } from './agendamento.controller';
import { RecursosController } from './recursos.controller';

// Use cases — recursos
import { CreateRecursoUseCase } from './application/recursos/create-recurso.use-case';
import { UpdateRecursoUseCase } from './application/recursos/update-recurso.use-case';
import { ListRecursosUseCase } from './application/recursos/list-recursos.use-case';
import {
  DeleteRecursoUseCase,
  GetRecursoUseCase,
} from './application/recursos/get-recurso.use-case';
import { SetDisponibilidadeUseCase } from './application/recursos/set-disponibilidade.use-case';
import {
  AddBloqueioUseCase,
  RemoveBloqueioUseCase,
} from './application/recursos/add-bloqueio.use-case';

// Use cases — slots / agendamentos
import { CalcularSlotsUseCase } from './application/slots/calcular-slots.use-case';
import { ValidarEncaixeUseCase } from './application/encaixe/validar-encaixe.use-case';
import { CreateAgendamentoUseCase } from './application/agendamentos/create-agendamento.use-case';
import { ListAgendamentosUseCase } from './application/agendamentos/list-agendamentos.use-case';
import { GetAgendamentoUseCase } from './application/agendamentos/get-agendamento.use-case';
import { ReagendarUseCase } from './application/agendamentos/reagendar.use-case';
import { CancelAgendamentoUseCase } from './application/agendamentos/cancel-agendamento.use-case';
import { ConfirmarUseCase } from './application/agendamentos/confirmar.use-case';
import { CheckinUseCase } from './application/agendamentos/checkin.use-case';
import { NoShowUseCase } from './application/agendamentos/no-show.use-case';

// Repository
import { AgendamentoRepository } from './infrastructure/agendamento.repository';

// Trilha B (Trilha A precisa do DailyCoService p/ TELECONSULTA)
import { AgendamentoSchedulerService } from './infrastructure/agendamento-scheduler.service';
import { ConfirmacaoWorker } from './infrastructure/confirmacao.worker';
import { DailyCoService } from './infrastructure/daily-co.service';
import { NoShowWorker } from './infrastructure/no-show.worker';
import { NotificacaoService } from './infrastructure/notificacao.service';

// O `TeleconsultaController` foi MIGRADO para `PortalPacienteModule` na
// Fase 11 R-B (`get-link-teleconsulta.use-case`). Lá a checagem é
// endurecida via `PacienteContextResolver` + permission
// `portal_paciente:teleconsulta` em vez do best-effort do legado.
// `import { TeleconsultaController } from './teleconsulta.controller';`
// — desligado para evitar conflito de rota com o controller novo.

@Module({
  controllers: [
    AgendamentoController,
    RecursosController,
  ],
  providers: [
    // Repo + use cases — Trilha A
    AgendamentoRepository,
    CreateRecursoUseCase,
    UpdateRecursoUseCase,
    ListRecursosUseCase,
    GetRecursoUseCase,
    DeleteRecursoUseCase,
    SetDisponibilidadeUseCase,
    AddBloqueioUseCase,
    RemoveBloqueioUseCase,
    CalcularSlotsUseCase,
    ValidarEncaixeUseCase,
    CreateAgendamentoUseCase,
    ListAgendamentosUseCase,
    GetAgendamentoUseCase,
    ReagendarUseCase,
    CancelAgendamentoUseCase,
    ConfirmarUseCase,
    CheckinUseCase,
    NoShowUseCase,
    // Trilha B
    NotificacaoService,
    DailyCoService,
    ConfirmacaoWorker,
    NoShowWorker,
    AgendamentoSchedulerService,
  ],
  exports: [
    AgendamentoRepository,
    NotificacaoService,
    DailyCoService,
    // Fase 11 R-B (Portal Paciente) reusa o use case para
    // auto-agendamento sem duplicar lógica de overbooking/teleconsulta.
    CreateAgendamentoUseCase,
  ],
})
export class AgendamentoModule {}
