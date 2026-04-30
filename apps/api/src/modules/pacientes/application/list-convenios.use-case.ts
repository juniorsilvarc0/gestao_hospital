/**
 * Use case: `GET /v1/pacientes/{uuid}/convenios` — vínculos ativos.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PacientesRepository } from '../infrastructure/pacientes.repository';
import type { VinculoConvenioResponse } from '../dto/paciente.response';
import { presentVinculo } from './paciente.presenter';

@Injectable()
export class ListConveniosUseCase {
  constructor(private readonly repo: PacientesRepository) {}

  async execute(uuid: string): Promise<{ data: VinculoConvenioResponse[] }> {
    const pacienteId = await this.repo.findIdByUuid(uuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }
    const rows = await this.repo.listVinculos(pacienteId);
    return { data: rows.map((row) => presentVinculo(row)) };
  }
}
