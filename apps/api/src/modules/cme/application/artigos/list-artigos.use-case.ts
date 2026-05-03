/**
 * `GET /v1/cme/artigos` — listagem paginada com filtros.
 */
import { Injectable } from '@nestjs/common';

import type { ListArtigosQueryDto } from '../../dto/list-artigos.dto';
import type { ListArtigosResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentArtigo } from './artigo.presenter';

@Injectable()
export class ListArtigosUseCase {
  constructor(private readonly repo: CmeRepository) {}

  async execute(query: ListArtigosQueryDto): Promise<ListArtigosResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let loteId: bigint | undefined;
    if (query.loteUuid !== undefined) {
      const lote = await this.repo.findLoteByUuid(query.loteUuid);
      loteId = lote?.id;
    }

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      pacienteId = id ?? undefined;
    }

    const { rows, total } = await this.repo.listArtigos({
      etapas: query.etapa,
      loteId,
      pacienteId,
      codigoArtigo: query.codigoArtigo,
      page,
      pageSize,
    });

    return {
      data: rows.map(presentArtigo),
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }
}
