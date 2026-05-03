/**
 * `GET /v1/visitas` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListVisitasQueryDto } from '../../dto/list-visitas.dto';
import type { ListVisitasResponse } from '../../dto/responses';
import { VisitantesRepository } from '../../infrastructure/visitantes.repository';
import { presentVisita } from './visita.presenter';

@Injectable()
export class ListVisitasUseCase {
  constructor(private readonly repo: VisitantesRepository) {}

  async execute(query: ListVisitasQueryDto): Promise<ListVisitasResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let visitanteId: bigint | undefined;
    if (query.visitanteUuid !== undefined) {
      const v = await this.repo.findVisitanteByUuid(query.visitanteUuid);
      visitanteId = v?.id;
    }
    let leitoId: bigint | undefined;
    if (query.leitoUuid !== undefined) {
      const id = await this.repo.findLeitoIdByUuid(query.leitoUuid);
      leitoId = id ?? undefined;
    }
    // Filter by paciente: deferimos para o repo via paciente_id quando
    // necessário; sem paciente_id no schema, listamos via JOIN no repo.
    // Como filtro adicional, traduzimos pacienteUuid para paciente_id
    // via uma query pequena.
    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      pacienteId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listVisitas({
      visitanteId,
      pacienteId,
      leitoId,
      apenasAtivas: query.apenasAtivas,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentVisita),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
