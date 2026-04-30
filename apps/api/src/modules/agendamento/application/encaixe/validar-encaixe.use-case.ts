/**
 * Encaixe (RN-AGE-06):
 *   - `permite_encaixe` deve ser TRUE no recurso → 422 caso contrário.
 *   - Quantidade de encaixes ativos do dia para o recurso < `encaixe_max_dia`.
 *
 * Validador é um use case dedicado para que o pipeline de criação
 * possa consumi-lo independentemente do INSERT.
 */
import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';

@Injectable()
export class ValidarEncaixeUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(input: {
    recursoId: bigint;
    permiteEncaixe: boolean;
    encaixeMaxDia: number;
    diaIso: string; // YYYY-MM-DD
  }): Promise<void> {
    if (!input.permiteEncaixe) {
      throw new UnprocessableEntityException({
        code: 'AGENDAMENTO_ENCAIXE_NAO_PERMITIDO',
        message: 'Este recurso não permite encaixe.',
      });
    }
    const total = await this.repo.countEncaixesNoDia(
      input.recursoId,
      input.diaIso,
    );
    if (total >= input.encaixeMaxDia) {
      throw new UnprocessableEntityException({
        code: 'AGENDAMENTO_LIMITE_ENCAIXE',
        message: `Limite diário de encaixes (${input.encaixeMaxDia}) atingido para o recurso. RN-AGE-06.`,
      });
    }
  }
}
