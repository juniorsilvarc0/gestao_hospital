/**
 * Use case: `GET /v1/pacientes/{uuid}/historico-atendimentos`.
 *
 * **PLACEHOLDER FASE 3** — devolve sempre `{ data: [] }`. A coluna
 * `atendimentos` chega na Fase 5 (recepção/atendimento). A Trilha A
 * deixa o endpoint pronto e auditado para que o frontend já consuma
 * sem precisar de feature-flag.
 *
 * Quando a Fase 5 mergir, o repositório ganha `listAtendimentos` e este
 * use case passa a retornar a lista real (sem mudança de contrato).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PacientesRepository } from '../infrastructure/pacientes.repository';

export interface HistoricoAtendimentoResponse {
  uuid: string;
  // Estrutura completa será desenhada na Fase 5.
  // Mantemos campo opcional para evolução compatível.
}

@Injectable()
export class HistoricoAtendimentosUseCase {
  constructor(private readonly repo: PacientesRepository) {}

  async execute(uuid: string): Promise<{ data: HistoricoAtendimentoResponse[] }> {
    const pacienteId = await this.repo.findIdByUuid(uuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }
    return { data: [] };
  }
}
