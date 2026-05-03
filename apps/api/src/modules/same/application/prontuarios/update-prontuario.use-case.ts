/**
 * `PATCH /v1/same/prontuarios/{uuid}` — atualiza metadados.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateProntuarioDto } from '../../dto/update-prontuario.dto';
import type { ProntuarioResponse } from '../../dto/responses';
import { SameRepository } from '../../infrastructure/same.repository';
import { presentProntuario } from './prontuario.presenter';

@Injectable()
export class UpdateProntuarioUseCase {
  constructor(
    private readonly repo: SameRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateProntuarioDto,
  ): Promise<ProntuarioResponse> {
    const row = await this.repo.findProntuarioByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PRONTUARIO_NOT_FOUND',
        message: 'Prontuário não encontrado.',
      });
    }

    await this.repo.updateProntuario({
      id: row.id,
      numeroPasta: dto.numeroPasta,
      localizacao: dto.localizacao,
      observacao: dto.observacao,
    });

    await this.auditoria.record({
      tabela: 'same_prontuarios',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'same.prontuario.atualizado',
        ...(dto.numeroPasta !== undefined
          ? {
              numero_pasta_anterior: row.numero_pasta,
              numero_pasta_novo: dto.numeroPasta,
            }
          : {}),
        ...(dto.localizacao !== undefined
          ? { localizacao_nova: dto.localizacao }
          : {}),
      },
      finalidade: 'same.prontuario.atualizado',
    });

    const updated = await this.repo.findProntuarioByUuid(uuid);
    if (updated === null) {
      throw new Error('Prontuário após update não encontrado (RLS?).');
    }
    return presentProntuario(updated);
  }
}
