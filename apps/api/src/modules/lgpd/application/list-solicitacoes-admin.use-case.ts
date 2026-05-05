/**
 * Use case: `GET /v1/lgpd/solicitacoes` (admin LGPD) — todas as
 * solicitações do tenant (RLS). Filtros opcionais: pacienteUuid, tipo,
 * status.
 */
import { Injectable } from '@nestjs/common';

import type { ListSolicitacoesQueryDto } from '../dto/list-solicitacoes-query.dto';
import type { ListSolicitacoesResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentSolicitacao } from './solicitacao.presenter';

@Injectable()
export class ListSolicitacoesAdminUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(
    query: ListSolicitacoesQueryDto,
  ): Promise<ListSolicitacoesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (id === null) {
        return { data: [], meta: { page, pageSize, total: 0, totalPages: 0 } };
      }
      pacienteId = id;
    }

    const { rows, total } = await this.repo.listSolicitacoes({
      pacienteId,
      tipo: query.tipo,
      status: query.status,
      page,
      pageSize,
    });
    return {
      data: rows.map(presentSolicitacao),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
