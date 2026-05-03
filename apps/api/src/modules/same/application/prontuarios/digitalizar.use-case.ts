/**
 * `POST /v1/same/prontuarios/{uuid}/digitalizar` — RN-SAM-03.
 *
 * - Marca `digitalizado=TRUE`, grava `pdf_legado_url`,
 *   `data_digitalizacao=now()`, `digitalizado_por=ctx.userId`.
 * - Se status atual = ARQUIVADO → muda para DIGITALIZADO.
 * - Se status atual = EMPRESTADO → mantém EMPRESTADO (a digitalização
 *   pode acontecer enquanto o prontuário está fora do arquivo). Após
 *   devolução, o `devolver` retornará para DIGITALIZADO.
 * - Se já está DIGITALIZADO → idempotente (atualiza URL e timestamp).
 * - DESCARTADO → 422.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { DigitalizarDto } from '../../dto/digitalizar.dto';
import type { ProntuarioResponse } from '../../dto/responses';
import {
  type ProntuarioStatus,
  podeEmprestar,
} from '../../domain/prontuario';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentProntuario } from './prontuario.presenter';

@Injectable()
export class DigitalizarUseCase {
  constructor(
    private readonly repo: SameRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: DigitalizarDto,
  ): Promise<ProntuarioResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DigitalizarUseCase requires request context.');
    }

    const row = await this.repo.findProntuarioByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PRONTUARIO_NOT_FOUND',
        message: 'Prontuário não encontrado.',
      });
    }

    if (row.status === 'DESCARTADO') {
      throw new UnprocessableEntityException({
        code: 'PRONTUARIO_DESCARTADO',
        message: 'Prontuário descartado não pode ser digitalizado.',
      });
    }

    // Decide novo status. EMPRESTADO mantém-se (devolução posterior
    // marcará DIGITALIZADO). ARQUIVADO/DIGITALIZADO → DIGITALIZADO.
    const novoStatus: ProntuarioStatus =
      row.status === 'EMPRESTADO' ? 'EMPRESTADO' : 'DIGITALIZADO';

    await this.repo.updateProntuarioDigitalizacao({
      id: row.id,
      pdfLegadoUrl: dto.pdfLegadoUrl,
      digitalizadoPor: ctx.userId,
      novoStatus,
    });

    await this.auditoria.record({
      tabela: 'same_prontuarios',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'same.prontuario.digitalizado',
        status_anterior: row.status,
        status_novo: novoStatus,
        // pdf_legado_url: NÃO logamos URL (pode conter token assinado).
      },
      finalidade: 'same.prontuario.digitalizado',
    });

    // Sanity para evitar warning de variável não utilizada — `podeEmprestar`
    // é exportado pelo domain e usado em outros use cases.
    void podeEmprestar;

    const updated = await this.repo.findProntuarioByUuid(uuid);
    if (updated === null) {
      throw new Error('Prontuário após digitalização não encontrado (RLS?).');
    }
    return presentProntuario(updated);
  }
}
