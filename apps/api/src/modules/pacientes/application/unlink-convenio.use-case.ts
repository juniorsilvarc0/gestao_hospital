/**
 * Use case: `DELETE /v1/pacientes/{uuid}/convenios/{vinculo_uuid}`.
 *
 * Soft-delete do vínculo paciente↔convênio (mantemos histórico para
 * análise de cobertura em recurso de glosa, Fase 9).
 *
 * Validação de pertencimento: o `vinculo_uuid` precisa corresponder ao
 * `paciente_uuid` informado — evita que um operador apague vínculo
 * "fantasma" digitando UUID errado e atinja outro paciente.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PacientesRepository } from '../infrastructure/pacientes.repository';

@Injectable()
export class UnlinkConvenioUseCase {
  constructor(private readonly repo: PacientesRepository) {}

  async execute(pacienteUuid: string, vinculoUuid: string): Promise<void> {
    const pacienteId = await this.repo.findIdByUuid(pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }
    const vinculo = await this.repo.findVinculoIdByUuid(vinculoUuid);
    if (vinculo === null || vinculo.pacienteId !== pacienteId) {
      throw new NotFoundException({
        code: 'VINCULO_NOT_FOUND',
        message: 'Vínculo não encontrado para o paciente informado.',
      });
    }
    await this.repo.softDeleteVinculo(vinculo.id);
  }
}
