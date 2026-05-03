/**
 * `PATCH /v1/visitantes/{uuid}` — atualiza dados não sensíveis.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateVisitanteDto } from '../../dto/update-visitante.dto';
import type { VisitanteResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class UpdateVisitanteUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateVisitanteDto,
  ): Promise<VisitanteResponse> {
    const row = await this.repo.findVisitanteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITANTE_NOT_FOUND',
        message: 'Visitante não encontrado.',
      });
    }

    await this.repo.updateVisitante({
      id: row.id,
      nome: dto.nome,
      documentoFotoUrl: dto.documentoFotoUrl,
      observacao: dto.observacao,
    });

    await this.auditoria.record({
      tabela: 'visitantes',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'visitante.atualizado',
        ...(dto.nome !== undefined ? { nome_alterado: true } : {}),
        ...(dto.documentoFotoUrl !== undefined
          ? { documento_foto_alterado: true }
          : {}),
      },
      finalidade: 'visitante.atualizado',
    });

    const updated = await this.repo.findVisitanteByUuid(uuid);
    if (updated === null) {
      throw new Error('Visitante após update não encontrado (RLS?).');
    }
    return presentVisitante(updated);
  }
}
