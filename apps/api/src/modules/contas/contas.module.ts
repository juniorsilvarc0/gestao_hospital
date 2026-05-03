/**
 * Bounded Context: Contas / Faturamento — Fase 8 (Trilha R-A).
 *
 * Responsabilidades:
 *   - CRUD do ciclo da conta do paciente (lifecycle ABERTA → FATURADA).
 *   - Elaboração com `inconsistency-checker` (RN-FAT-01/05/06).
 *   - Recálculo idempotente (RN-FAT-07) usando audit `contas.recalculada`.
 *   - Snapshots de versão TISS, condição contratual, tabela de preços e
 *     ISS no fechamento (RN-FAT-02/10).
 *   - CRUD de Pacotes de Cobrança (RN-FAT-05).
 *
 * Eventos publicados (sem listeners ainda):
 *   - `conta.fechada`: consumido por R-B (TISS) e por R-C (Glosas).
 *
 * Não inclui geração TISS — está em Trilha R-B (`tiss/`).
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CancelarContaUseCase } from './application/contas/cancelar-conta.use-case';
import { ElaborarContaUseCase } from './application/contas/elaborar-conta.use-case';
import { FecharContaUseCase } from './application/contas/fechar-conta.use-case';
import { GerarEspelhoUseCase } from './application/contas/gerar-espelho.use-case';
import { GetContaUseCase } from './application/contas/get-conta.use-case';
import { LancarItemManualUseCase } from './application/contas/lancar-item-manual.use-case';
import { ListContasUseCase } from './application/contas/list-contas.use-case';
import { ReabrirContaUseCase } from './application/contas/reabrir-conta.use-case';
import { RecalcularContaUseCase } from './application/contas/recalcular-conta.use-case';
import { RemoverItemUseCase } from './application/contas/remover-item.use-case';
import { CreatePacoteUseCase } from './application/pacotes/create-pacote.use-case';
import { DeletePacoteUseCase } from './application/pacotes/delete-pacote.use-case';
import { GetPacoteUseCase } from './application/pacotes/get-pacote.use-case';
import { ListPacotesUseCase } from './application/pacotes/list-pacotes.use-case';
import { UpdatePacoteUseCase } from './application/pacotes/update-pacote.use-case';
import { ContasController } from './infrastructure/controllers/contas.controller';
import { PacotesController } from './infrastructure/controllers/pacotes.controller';
import { ContasRepository } from './infrastructure/contas.repository';
import { PacotesRepository } from './infrastructure/pacotes.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [ContasController, PacotesController],
  providers: [
    ContasRepository,
    PacotesRepository,
    // Contas
    ListContasUseCase,
    GetContaUseCase,
    LancarItemManualUseCase,
    RemoverItemUseCase,
    ElaborarContaUseCase,
    RecalcularContaUseCase,
    FecharContaUseCase,
    ReabrirContaUseCase,
    CancelarContaUseCase,
    GerarEspelhoUseCase,
    // Pacotes
    ListPacotesUseCase,
    GetPacoteUseCase,
    CreatePacoteUseCase,
    UpdatePacoteUseCase,
    DeletePacoteUseCase,
  ],
  exports: [
    ContasRepository,
    // Fase 11 R-B (Portal Paciente) consome o gerador de espelho.
    GerarEspelhoUseCase,
  ],
})
export class ContasModule {}
