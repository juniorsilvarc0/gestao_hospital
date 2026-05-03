/**
 * Bounded Context: Portal do Paciente — Fase 11 (Trilha R-B).
 *
 * Entrega:
 *   - Endpoints `/v1/portal/paciente/*` autorizados via permissions
 *     `portal_paciente:*`, `lgpd_consent:*`, `notificacoes:*`.
 *   - Resolução automática do `paciente_id` via
 *     `PacienteContextResolver` (lê `usuarios.paciente_id` a partir do
 *     `RequestContextStorage`); rejeita 403 quando o usuário não é
 *     PACIENTE ou não tem vínculo.
 *   - Auto-agendamento delegando para `CreateAgendamentoUseCase`
 *     (AgendamentoModule), validando convênio antes.
 *   - Espelho de conta delegando para `GerarEspelhoUseCase`
 *     (ContasModule).
 *   - Receita PDF delegando para `BaixarDocumentoPdfUseCase`
 *     (PepModule).
 *   - LGPD consentimentos (registrar / revogar) e notificações
 *     (listar / marcar lida).
 *
 * Dependências cruzadas:
 *   - `AgendamentoModule` exporta `AgendamentoRepository` e
 *     (provider) `CreateAgendamentoUseCase` é interno — para
 *     reaproveitar precisamos importar o módulo todo.
 *   - `ContasModule` exporta `ContasRepository`; o
 *     `GerarEspelhoUseCase` é interno — idem.
 *   - `PepModule` exporta o `PdfRendererService` e o
 *     `BaixarDocumentoPdfUseCase` é interno — idem.
 *
 * Por que importar o módulo inteiro? O `CreateAgendamentoUseCase` e
 * cia. são `@Injectable` registrados nos providers desses módulos.
 * O Nest 10 não exige re-export — basta importar o módulo e o use
 * case já passa a estar disponível para injeção (via providers).
 *
 * IMPORTANT: existe um controller legado
 * `apps/api/src/modules/agendamento/teleconsulta.controller.ts` que
 * registra a mesma rota `GET /v1/portal/paciente/teleconsulta/:uuid/link`.
 * Para não quebrar consumidores antigos enquanto este módulo entra,
 * mantemos o legado vivo — porém ele dependia apenas do JWT (sem
 * permission granular). O caminho NOVO usa
 * `portal_paciente:teleconsulta`. Quando RBAC for forçado em todos
 * os clientes, removemos o legado (TODO Fase 13).
 */
import { Module } from '@nestjs/common';

import { AgendamentoModule } from '../agendamento/agendamento.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ContasModule } from '../contas/contas.module';
import { PepModule } from '../pep/pep.module';

// Domain
import { PacienteContextResolver } from './domain/paciente-context';

// Application — me
import { GetMePacienteUseCase } from './application/me/get-me-paciente.use-case';

// Application — agendamentos
import { ListAgendamentosPacienteUseCase } from './application/agendamentos/list-agendamentos-paciente.use-case';
import { AutoAgendarUseCase } from './application/agendamentos/auto-agendar.use-case';

// Application — exames
import { ListExamesPacienteUseCase } from './application/exames/list-exames-paciente.use-case';
import { GetResultadoPacienteUseCase } from './application/exames/get-resultado-paciente.use-case';

// Application — receitas
import { ListReceitasPacienteUseCase } from './application/receitas/list-receitas-paciente.use-case';
import { GetReceitaPdfUseCase } from './application/receitas/get-receita-pdf.use-case';

// Application — teleconsulta
import { GetLinkTeleconsultaUseCase } from './application/teleconsulta/get-link-teleconsulta.use-case';

// Application — contas
import { ListContasPacienteUseCase } from './application/contas/list-contas-paciente.use-case';
import { GetEspelhoPacienteUseCase } from './application/contas/get-espelho-paciente.use-case';

// Application — consentimentos
import { ListConsentimentosUseCase } from './application/consentimentos/list-consentimentos.use-case';
import { RegistrarConsentimentoUseCase } from './application/consentimentos/registrar-consentimento.use-case';
import { RevogarConsentimentoUseCase } from './application/consentimentos/revogar-consentimento.use-case';

// Application — notificacoes
import { ListNotificacoesUseCase } from './application/notificacoes/list-notificacoes.use-case';
import { MarcarLidaUseCase } from './application/notificacoes/marcar-lida.use-case';

// Infra
import { PortalPacienteRepository } from './infrastructure/portal-paciente.repository';
import { PortalPacienteController } from './infrastructure/controllers/portal-paciente.controller';
import { ConsentimentosController } from './infrastructure/controllers/consentimentos.controller';
import { NotificacoesController } from './infrastructure/controllers/notificacoes.controller';

@Module({
  imports: [
    AuditoriaModule,
    AgendamentoModule, // CreateAgendamentoUseCase + AgendamentoRepository
    ContasModule, //      GerarEspelhoUseCase + ContasRepository
    PepModule, //         BaixarDocumentoPdfUseCase
  ],
  controllers: [
    PortalPacienteController,
    ConsentimentosController,
    NotificacoesController,
  ],
  providers: [
    // Domain
    PacienteContextResolver,
    // Repository
    PortalPacienteRepository,
    // Use cases
    GetMePacienteUseCase,
    ListAgendamentosPacienteUseCase,
    AutoAgendarUseCase,
    ListExamesPacienteUseCase,
    GetResultadoPacienteUseCase,
    ListReceitasPacienteUseCase,
    GetReceitaPdfUseCase,
    GetLinkTeleconsultaUseCase,
    ListContasPacienteUseCase,
    GetEspelhoPacienteUseCase,
    ListConsentimentosUseCase,
    RegistrarConsentimentoUseCase,
    RevogarConsentimentoUseCase,
    ListNotificacoesUseCase,
    MarcarLidaUseCase,
  ],
})
export class PortalPacienteModule {}
