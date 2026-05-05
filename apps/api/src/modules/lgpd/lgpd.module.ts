/**
 * Bounded Context: LGPD — completado em Fase 13 (R-A).
 *
 * Endpoints `/v1/lgpd/*`:
 *   - Solicitações Art. 18 (acesso, correção, exclusão, portabilidade)
 *   - Exports FHIR/JSON com dual approval (RN-LGP-04)
 *
 * Reaproveita `PacientesRepository` + `CpfCryptoService` exportados pelo
 * `PacientesModule` (necessários para `ExportarPacienteUseCase` e o
 * `FhirSerializer`). `AuditoriaService` é provido globalmente pelo
 * `AuditoriaModule` (`@Global()`).
 */
import { Module } from '@nestjs/common';

import { PacientesModule } from '../pacientes/pacientes.module';

// Solicitações
import { CriarSolicitacaoAcessoUseCase } from './application/criar-solicitacao-acesso.use-case';
import { CriarSolicitacaoCorrecaoUseCase } from './application/criar-solicitacao-correcao.use-case';
import { CriarSolicitacaoExclusaoUseCase } from './application/criar-solicitacao-exclusao.use-case';
import { CriarSolicitacaoPortabilidadeUseCase } from './application/criar-solicitacao-portabilidade.use-case';
import { ListSolicitacoesAdminUseCase } from './application/list-solicitacoes-admin.use-case';
import { ListSolicitacoesPacienteUseCase } from './application/list-solicitacoes-paciente.use-case';

// Exports
import { AprovarDpoUseCase } from './application/aprovar-dpo.use-case';
import { AprovarSupervisorUseCase } from './application/aprovar-supervisor.use-case';
import { BaixarExportUseCase } from './application/baixar-export.use-case';
import { CriarExportUseCase } from './application/criar-export.use-case';
import { ExportarPacienteUseCase } from './application/exportar-paciente.use-case';
import { GerarExportUseCase } from './application/gerar-export.use-case';
import { GetExportUseCase } from './application/get-export.use-case';
import { ListExportsUseCase } from './application/list-exports.use-case';
import { RejeitarExportUseCase } from './application/rejeitar-export.use-case';

import { FhirSerializer } from './infrastructure/fhir-serializer';
import { LgpdRepository } from './infrastructure/lgpd.repository';

import { LgpdController } from './lgpd.controller';

@Module({
  imports: [PacientesModule],
  controllers: [LgpdController],
  providers: [
    // Repositório + serializadores compartilhados
    LgpdRepository,
    FhirSerializer,

    // Solicitações
    CriarSolicitacaoAcessoUseCase,
    CriarSolicitacaoCorrecaoUseCase,
    CriarSolicitacaoExclusaoUseCase,
    CriarSolicitacaoPortabilidadeUseCase,
    ListSolicitacoesAdminUseCase,
    ListSolicitacoesPacienteUseCase,

    // Exports
    CriarExportUseCase,
    ListExportsUseCase,
    GetExportUseCase,
    AprovarDpoUseCase,
    AprovarSupervisorUseCase,
    RejeitarExportUseCase,
    GerarExportUseCase,
    BaixarExportUseCase,
    ExportarPacienteUseCase,
  ],
})
export class LgpdModule {}
