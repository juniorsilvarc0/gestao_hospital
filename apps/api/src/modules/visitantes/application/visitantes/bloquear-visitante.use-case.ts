/**
 * `POST /v1/visitantes/{uuid}/bloquear` — bloqueia visitante.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { BloquearVisitanteDto } from '../../dto/bloquear-visitante.dto';
import type { VisitanteResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisitante } from './visitante.presenter';

@Injectable()
export class BloquearVisitanteUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: BloquearVisitanteDto,
  ): Promise<VisitanteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('BloquearVisitanteUseCase requires request context.');
    }

    const row = await this.repo.findVisitanteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITANTE_NOT_FOUND',
        message: 'Visitante não encontrado.',
      });
    }

    if (row.bloqueado) {
      throw new UnprocessableEntityException({
        code: 'VISITANTE_JA_BLOQUEADO',
        message: 'Visitante já está bloqueado.',
      });
    }

    await this.repo.bloquearVisitante({
      id: row.id,
      motivo: dto.motivo,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'visitantes',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'visitante.bloqueado',
        motivo: dto.motivo,
      },
      finalidade: 'visitante.bloqueado',
    });

    const updated = await this.repo.findVisitanteByUuid(uuid);
    if (updated === null) {
      throw new Error('Visitante após bloqueio não encontrado (RLS?).');
    }
    return presentVisitante(updated);
  }
}
