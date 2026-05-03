/**
 * `POST /v1/same/emprestimos` — RN-SAM-01.
 *
 * - Solicitante = `ctx.userId` (capturado do JWT, jamais do body).
 * - Status atual do prontuário deve ser ARQUIVADO ou DIGITALIZADO
 *   (não pode emprestar o que já está fora ou descartado).
 * - `data_devolucao_prevista` default = hoje + 30 dias; se enviada,
 *   precisa ser >= today (RN-SAM-01).
 * - Após INSERT, prontuário muda para EMPRESTADO.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  defaultPrazoDevolucao,
  isPrazoValido,
} from '../../domain/emprestimo';
import { podeEmprestar } from '../../domain/prontuario';
import type { CreateEmprestimoDto } from '../../dto/create-emprestimo.dto';
import type { EmprestimoResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentEmprestimo } from './emprestimo.presenter';

@Injectable()
export class CreateEmprestimoUseCase {
  constructor(
    private readonly repo: SameRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateEmprestimoDto): Promise<EmprestimoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateEmprestimoUseCase requires request context.');
    }

    const prontuario = await this.repo.findProntuarioByUuid(
      dto.prontuarioUuid,
    );
    if (prontuario === null) {
      throw new NotFoundException({
        code: 'PRONTUARIO_NOT_FOUND',
        message: 'Prontuário não encontrado.',
      });
    }

    if (!podeEmprestar(prontuario.status)) {
      throw new UnprocessableEntityException({
        code: 'PRONTUARIO_INDISPONIVEL',
        message: `Prontuário em status ${prontuario.status} não pode ser emprestado.`,
      });
    }

    const prazo = dto.dataDevolucaoPrevista ?? defaultPrazoDevolucao();
    if (!isPrazoValido(prazo)) {
      throw new UnprocessableEntityException({
        code: 'PRAZO_INVALIDO',
        message: 'data_devolucao_prevista deve ser hoje ou futura.',
      });
    }

    const inserted = await this.repo.insertEmprestimo({
      tenantId: ctx.tenantId,
      prontuarioId: prontuario.id,
      solicitanteId: ctx.userId,
      motivo: dto.motivo,
      dataDevolucaoPrevista: prazo,
    });

    await this.repo.updateProntuarioStatus({
      id: prontuario.id,
      status: 'EMPRESTADO',
    });

    await this.auditoria.record({
      tabela: 'same_emprestimos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'same.emprestimo.criado',
        prontuario_uuid: prontuario.uuid_externo,
        status_prontuario_anterior: prontuario.status,
        status_prontuario_novo: 'EMPRESTADO',
        prazo,
      },
      finalidade: 'same.emprestimo.criado',
    });

    const row = await this.repo.findEmprestimoByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Empréstimo criado não encontrado (RLS?).');
    }
    return presentEmprestimo(row);
  }
}
