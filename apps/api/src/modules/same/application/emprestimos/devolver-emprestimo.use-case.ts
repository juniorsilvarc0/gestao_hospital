/**
 * `POST /v1/same/emprestimos/{uuid}/devolver` — devolve prontuário.
 *
 * - Empréstimo deve estar ATIVO ou ATRASADO.
 * - Atualiza `data_devolucao_real=now()`, status → DEVOLVIDO.
 * - Atualiza prontuário: se já tinha sido digitalizado, retorna a
 *   DIGITALIZADO; senão, ARQUIVADO.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextStatus as nextEmprestimoStatus } from '../../domain/emprestimo';
import type { ProntuarioStatus } from '../../domain/prontuario';
import type { DevolverEmprestimoDto } from '../../dto/devolver-emprestimo.dto';
import type { EmprestimoResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentEmprestimo } from './emprestimo.presenter';

@Injectable()
export class DevolverEmprestimoUseCase {
  constructor(
    private readonly repo: SameRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: DevolverEmprestimoDto,
  ): Promise<EmprestimoResponse> {
    const row = await this.repo.findEmprestimoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'EMPRESTIMO_NOT_FOUND',
        message: 'Empréstimo não encontrado.',
      });
    }

    const next = nextEmprestimoStatus(row.status, 'devolver');
    if (next === null) {
      throw new UnprocessableEntityException({
        code: 'EMPRESTIMO_TRANSICAO_INVALIDA',
        message: `Empréstimo em status ${row.status} não pode ser devolvido.`,
      });
    }

    await this.repo.updateEmprestimoDevolucao({
      id: row.id,
      observacao: dto.observacao ?? null,
    });

    // Decide para qual status o prontuário volta. Se foi digitalizado
    // em algum momento, retorna a DIGITALIZADO; senão ARQUIVADO.
    const prontuario = await this.repo.findProntuarioById(row.prontuario_id);
    const novoStatusProntuario: ProntuarioStatus =
      prontuario !== null && prontuario.digitalizado
        ? 'DIGITALIZADO'
        : 'ARQUIVADO';

    await this.repo.updateProntuarioStatus({
      id: row.prontuario_id,
      status: novoStatusProntuario,
    });

    await this.auditoria.record({
      tabela: 'same_emprestimos',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'same.emprestimo.devolvido',
        status_anterior: row.status,
        status_novo: next,
        status_prontuario_novo: novoStatusProntuario,
      },
      finalidade: 'same.emprestimo.devolvido',
    });

    const updated = await this.repo.findEmprestimoByUuid(uuid);
    if (updated === null) {
      throw new Error('Empréstimo após devolução não encontrado (RLS?).');
    }
    return presentEmprestimo(updated);
  }
}
