/**
 * Bounded Context: SAME (Arquivo de Prontuários) — Fase 10 (Trilha R-B).
 *
 * Entrega:
 *   - CRUD de prontuários físicos (RN-SAM-03 digitalização inclusa).
 *   - Empréstimos com prazo padrão 30 dias (RN-SAM-01) e auto-detecção
 *     de atraso (RN-SAM-02) via endpoint `/atrasados`.
 *   - Soft state-machine: ARQUIVADO ↔ EMPRESTADO ↔ DIGITALIZADO,
 *     coerência mantida no use case (sem trigger DB para o lifecycle).
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CreateEmprestimoUseCase } from './application/emprestimos/create-emprestimo.use-case';
import { DevolverEmprestimoUseCase } from './application/emprestimos/devolver-emprestimo.use-case';
import { ListAtrasadosUseCase } from './application/emprestimos/list-atrasados.use-case';
import { ListEmprestimosUseCase } from './application/emprestimos/list-emprestimos.use-case';
import { CreateProntuarioUseCase } from './application/prontuarios/create-prontuario.use-case';
import { DigitalizarUseCase } from './application/prontuarios/digitalizar.use-case';
import { GetProntuarioUseCase } from './application/prontuarios/get-prontuario.use-case';
import { ListProntuariosUseCase } from './application/prontuarios/list-prontuarios.use-case';
import { UpdateProntuarioUseCase } from './application/prontuarios/update-prontuario.use-case';
import { EmprestimosController } from './infrastructure/controllers/emprestimos.controller';
import { ProntuariosController } from './infrastructure/controllers/prontuarios.controller';
import { SameRepository } from './infrastructure/same.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [ProntuariosController, EmprestimosController],
  providers: [
    SameRepository,
    // Prontuários
    ListProntuariosUseCase,
    GetProntuarioUseCase,
    CreateProntuarioUseCase,
    UpdateProntuarioUseCase,
    DigitalizarUseCase,
    // Empréstimos
    ListEmprestimosUseCase,
    ListAtrasadosUseCase,
    CreateEmprestimoUseCase,
    DevolverEmprestimoUseCase,
  ],
  exports: [SameRepository],
})
export class SameModule {}
