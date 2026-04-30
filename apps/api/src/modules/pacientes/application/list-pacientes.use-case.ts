/**
 * Use case: `GET /v1/pacientes` — busca trigram + paginação.
 *
 * Diferente de `getPaciente`, **não** registra `acessos_prontuario` —
 * a listagem retorna apenas dados sumarizados (nome, código, CPF
 * mascarado), o que é considerado consulta de cadastro, não de
 * prontuário (RN-LGP-01 trata de prontuário/visualização). Quando o
 * usuário abre o detalhe (`GET :uuid`), aí sim registramos.
 */
import { Injectable } from '@nestjs/common';

import { PacientesRepository } from '../infrastructure/pacientes.repository';
import type { ListPacientesQueryDto } from '../dto/list-pacientes.dto';
import type {
  PaginatedResponse,
  PacienteResponse,
} from '../dto/paciente.response';
import { presentPaciente } from './paciente.presenter';

@Injectable()
export class ListPacientesUseCase {
  constructor(private readonly repo: PacientesRepository) {}

  async execute(
    query: ListPacientesQueryDto,
  ): Promise<PaginatedResponse<PacienteResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    let convenioId: bigint | undefined;
    if (query.convenioUuid !== undefined) {
      const id = await this.repo.findConvenioIdByUuid(query.convenioUuid);
      if (id === null) {
        // Convênio inexistente → resultado vazio (não erro, para UI ficar tolerante).
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 1 },
        };
      }
      convenioId = id;
    }

    const { data, total } = await this.repo.list({
      page,
      pageSize,
      ...(query.q !== undefined ? { q: query.q } : {}),
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(convenioId !== undefined ? { convenioId } : {}),
      ...(query.nascidoEmGte !== undefined
        ? { nascidoEmGte: query.nascidoEmGte }
        : {}),
      ...(query.nascidoEmLte !== undefined
        ? { nascidoEmLte: query.nascidoEmLte }
        : {}),
    });

    return {
      data: data.map((row) => presentPaciente(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
