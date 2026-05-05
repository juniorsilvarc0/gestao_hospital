/**
 * `GET /v1/auditoria/eventos` — listagem paginada de
 * `auditoria_eventos` com filtros.
 *
 * Permission: `auditoria:read`. RLS já isola por tenant.
 */
import { Injectable } from '@nestjs/common';

import type { ListEventosQueryDto } from '../dto/list-eventos-query.dto';
import type { ListEventosResponse } from '../dto/responses';
import { AuditoriaConsultaRepository } from '../infrastructure/auditoria-consulta.repository';
import { presentAuditEvento } from './presenter';

@Injectable()
export class ListEventosUseCase {
  constructor(private readonly repo: AuditoriaConsultaRepository) {}

  async execute(query: ListEventosQueryDto): Promise<ListEventosResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let usuarioId: bigint | undefined;
    if (query.usuarioUuid !== undefined) {
      const id = await this.repo.findUserIdByUuid(query.usuarioUuid);
      // Quando o UUID não casa com nada, retornamos vazio em vez de 404 —
      // assim o consumer não precisa adivinhar se o filtro está bem feito.
      if (id === null) {
        return {
          data: [],
          meta: { page, pageSize, total: 0, totalPages: 0 },
        };
      }
      usuarioId = id;
    }

    const { rows, total } = await this.repo.listEventos({
      tabela: query.tabela,
      finalidade: query.finalidade,
      usuarioId,
      operacao: query.operacao,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentAuditEvento),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
