/**
 * Bounded Context: Prescrições — Fase 6.
 *
 * Entrega:
 *   - Criação com validações bloqueantes (RN-PEP-05/06, RN-PRE-07):
 *     alergia / interação medicamentosa / dose máxima diária. Override
 *     exige justificativa + permissão granular.
 *   - Assinatura ICP-Brasil (port — fase atual usa `LocalIcpBrasilStub`).
 *   - Análise farmacêutica (RN-PRE-01) — APROVADA→ATIVA, RECUSADA→
 *     RECUSADA_FARMACIA, APROVADA_RESSALVAS→ATIVA.
 *   - Suspensão (RN-PRE-05) — prescrição inteira ou item.
 *   - Reaprazamento (RN-PRE-04) — enfermagem ajusta horários, não viola
 *     imutabilidade.
 *
 * Importa `PepModule` para reusar o `PepAcessoInterceptor` (LGPD log).
 */
import { Module } from '@nestjs/common';

import { PepModule } from '../pep/pep.module';
import { AnalisarPrescricaoUseCase } from './application/analisar-prescricao.use-case';
import { AssinarPrescricaoUseCase } from './application/assinar-prescricao.use-case';
import { CriarPrescricaoUseCase } from './application/criar-prescricao.use-case';
import { GetPrescricaoUseCase } from './application/get-prescricao.use-case';
import { ListPrescricoesUseCase } from './application/list-prescricoes.use-case';
import { ReaprazarPrescricaoUseCase } from './application/reaprazar-prescricao.use-case';
import { SuspenderPrescricaoUseCase } from './application/suspender-prescricao.use-case';
import { AlergiaValidator } from './infrastructure/alergia.validator';
import { DoseMaxValidator } from './infrastructure/dose-max.validator';
import {
  ICP_BRASIL_SIGNER,
  LocalIcpBrasilStub,
} from './infrastructure/icp-brasil.port';
import { InteracaoValidator } from './infrastructure/interacao.validator';
import { PermissionChecker } from './infrastructure/permission-checker.service';
import { PrescricoesRepository } from './infrastructure/prescricoes.repository';
import { PrescricoesController } from './prescricoes.controller';

@Module({
  imports: [PepModule],
  controllers: [PrescricoesController],
  providers: [
    // Infra
    PrescricoesRepository,
    AlergiaValidator,
    InteracaoValidator,
    DoseMaxValidator,
    PermissionChecker,
    // ICP-Brasil signer — port via token. Stub local até a Fase 13
    // entregar a integração real (lib-cades + TSA + CRL/OCSP).
    LocalIcpBrasilStub,
    {
      provide: ICP_BRASIL_SIGNER,
      useExisting: LocalIcpBrasilStub,
    },

    // Use cases
    ListPrescricoesUseCase,
    GetPrescricaoUseCase,
    CriarPrescricaoUseCase,
    AssinarPrescricaoUseCase,
    AnalisarPrescricaoUseCase,
    SuspenderPrescricaoUseCase,
    ReaprazarPrescricaoUseCase,
  ],
  exports: [PrescricoesRepository],
})
export class PrescricoesModule {}
