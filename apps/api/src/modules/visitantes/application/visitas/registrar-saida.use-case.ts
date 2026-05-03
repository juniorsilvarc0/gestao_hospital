/**
 * `POST /v1/visitas/{uuid}/saida` — registra saída do visitante.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { VisitaResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisita } from './visita.presenter';

@Injectable()
export class RegistrarSaidaUseCase {
  constructor(
    private readonly repo: VisitantesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<VisitaResponse> {
    const row = await this.repo.findVisitaByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'VISITA_NOT_FOUND',
        message: 'Visita não encontrada.',
      });
    }

    if (row.data_saida !== null) {
      throw new UnprocessableEntityException({
        code: 'VISITA_JA_FINALIZADA',
        message: 'Visita já tem saída registrada.',
      });
    }

    await this.repo.updateVisitaSaida({ id: row.id });

    await this.auditoria.record({
      tabela: 'visitas',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'visita.saida_registrada',
      },
      finalidade: 'visita.saida_registrada',
    });

    const updated = await this.repo.findVisitaByUuid(uuid);
    if (updated === null) {
      throw new Error('Visita após saída não encontrada (RLS?).');
    }
    return presentVisita(updated);
  }
}
