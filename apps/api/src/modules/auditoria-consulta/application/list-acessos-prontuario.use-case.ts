/**
 * `GET /v1/auditoria/acessos-prontuario` — quem acessou prontuário
 * de quem, quando, com que finalidade.
 *
 * Permission: `auditoria:acessos`. Permissão sensível — apenas DPO,
 * Auditor e Admin têm. RLS já isola por tenant.
 */
import { Injectable } from '@nestjs/common';

import type { ListAcessosQueryDto } from '../dto/list-acessos-query.dto';
import type { ListAcessosResponse } from '../dto/responses';
import { AuditoriaConsultaRepository } from '../infrastructure/auditoria-consulta.repository';
import { presentAcesso } from './presenter';

@Injectable()
export class ListAcessosProntuarioUseCase {
  constructor(private readonly repo: AuditoriaConsultaRepository) {}

  async execute(query: ListAcessosQueryDto): Promise<ListAcessosResponse> {
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

    let usuarioId: bigint | undefined;
    if (query.usuarioUuid !== undefined) {
      const id = await this.repo.findUserIdByUuid(query.usuarioUuid);
      if (id === null) {
        return { data: [], meta: { page, pageSize, total: 0, totalPages: 0 } };
      }
      usuarioId = id;
    }

    const { rows, total } = await this.repo.listAcessos({
      pacienteId,
      usuarioId,
      finalidade: query.finalidade,
      modulo: query.modulo,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentAcesso),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
