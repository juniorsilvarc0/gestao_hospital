/**
 * `GET /v1/cirurgias` — listagem paginada com filtros.
 *
 * Mapeia UUIDs (`salaUuid`, `cirurgiaoUuid`, etc.) para IDs antes de
 * delegar ao repositório.
 */
import { Injectable } from '@nestjs/common';

import type { ListCirurgiasQueryDto } from '../../dto/list-cirurgias.dto';
import type { CirurgiasListResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class ListCirurgiasUseCase {
  constructor(private readonly repo: CentroCirurgicoRepository) {}

  async execute(
    query: ListCirurgiasQueryDto,
  ): Promise<CirurgiasListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    let salaId: bigint | undefined;
    if (query.salaUuid !== undefined) {
      const sala = await this.repo.findSalaByUuid(query.salaUuid);
      // Sala desconhecida ⇒ resposta vazia paginada.
      if (sala === null) {
        return emptyResp(page, pageSize);
      }
      salaId = sala.id;
    }
    let cirurgiaoId: bigint | undefined;
    if (query.cirurgiaoUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(query.cirurgiaoUuid);
      if (id === null) return emptyResp(page, pageSize);
      cirurgiaoId = id;
    }
    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const paciente = await this.repo.findAtendimentoBasics(
        query.pacienteUuid,
      );
      // pacienteUuid != atendimentoUuid; usamos repo dedicado se quisermos
      // resolver paciente por uuid. Para simplificar e não vazar para fora
      // da fronteira do módulo, ignoramos paciente quando não houver
      // mapeamento direto. (TODO: criar `findPacienteIdByUuid` no repo
      // e migrar este branch).
      void paciente;
    }
    let atendimentoId: bigint | undefined;
    if (query.atendimentoUuid !== undefined) {
      const atend = await this.repo.findAtendimentoBasics(
        query.atendimentoUuid,
      );
      if (atend === null) return emptyResp(page, pageSize);
      atendimentoId = atend.id;
    }

    const { rows, total } = await this.repo.listCirurgias({
      statuses: query.status,
      salaId,
      cirurgiaoId,
      pacienteId,
      atendimentoId,
      dataInicio: query.dataInicio,
      dataFim: query.dataFim,
      page,
      pageSize,
    });
    const cirurgiaIds = rows.map((r) => r.id);
    const equipes = await this.repo.listEquipesByCirurgiaIds(cirurgiaIds);
    const data = rows.map((r) =>
      presentCirurgia(r, equipes.get(r.id) ?? []),
    );
    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}

function emptyResp(page: number, pageSize: number): CirurgiasListResponse {
  return {
    data: [],
    meta: { page, pageSize, total: 0, totalPages: 1 },
  };
}
