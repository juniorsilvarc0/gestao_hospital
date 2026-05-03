/**
 * `POST /v1/visitantes/{uuid}/desbloquear` — remove bloqueio.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { VisitanteResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class DesbloquearVisitanteUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<VisitanteResponse> {
    const row = await this.repo.findVisitanteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITANTE_NOT_FOUND',
        message: 'Visitante não encontrado.',
      });
    }

    if (!row.bloqueado) {
      throw new UnprocessableEntityException({
        code: 'VISITANTE_NAO_BLOQUEADO',
        message: 'Visitante não está bloqueado.',
      });
    }

    await this.repo.desbloquearVisitante({ id: row.id });

    await this.auditoria.record({
      tabela: 'visitantes',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'visitante.desbloqueado',
        motivo_anterior: row.motivo_bloqueio,
      },
      finalidade: 'visitante.desbloqueado',
    });

    const updated = await this.repo.findVisitanteByUuid(uuid);
    if (updated === null) {
      throw new Error('Visitante após desbloqueio não encontrado (RLS?).');
    }
    return presentVisitante(updated);
  }
}
