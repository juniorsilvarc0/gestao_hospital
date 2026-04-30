/**
 * Bounded Context: LGPD — Fase 3 Trilha A.
 *
 * Endpoints `/v1/lgpd/*` (export + solicitação de exclusão). Reaproveita
 * o `PacientesRepository` e `CpfCryptoService` exportados pelo
 * `PacientesModule`.
 *
 * Fases futuras:
 *   - Fase 11 (portal paciente): endpoints de acesso/portabilidade/
 *     correção.
 *   - Fase 12 (BI): dashboard de pendências LGPD para o Encarregado.
 */
import { Module } from '@nestjs/common';

import { PacientesModule } from '../pacientes/pacientes.module';
import { LgpdController } from './lgpd.controller';
import { ExportarPacienteUseCase } from './application/exportar-paciente.use-case';
import { CriarSolicitacaoExclusaoUseCase } from './application/criar-solicitacao-exclusao.use-case';

@Module({
  imports: [PacientesModule],
  controllers: [LgpdController],
  providers: [ExportarPacienteUseCase, CriarSolicitacaoExclusaoUseCase],
})
export class LgpdModule {}
