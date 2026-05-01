/**
 * `GET /v1/solicitacoes-exame` (e `/v1/atendimentos/:atendUuid/solicitacoes-exame`).
 *
 * Filtros: atendimentoUuid, pacienteUuid, urgencia, status (CSV),
 * rangeInicio/rangeFim (sobre `data_solicitacao`). Paginação offset.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  PaginatedResponse,
  SolicitacaoExameResponse,
} from '../dto/exame.response';
import type { ListSolicitacoesQueryDto } from '../dto/list-solicitacoes.dto';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentSolicitacao } from './solicitacao.presenter';

@Injectable()
export class ListSolicitacoesUseCase {
  constructor(private readonly repo: ExamesRepository) {}

  async execute(
    query: ListSolicitacoesQueryDto,
    /** Quando vier do nested route `/atendimentos/:atendUuid/solicitacoes-exame`. */
    atendimentoUuidOverride?: string,
  ): Promise<PaginatedResponse<SolicitacaoExameResponse>> {
    let atendimentoId: bigint | undefined;
    const atendUuid = atendimentoUuidOverride ?? query.atendimentoUuid;
    if (atendUuid !== undefined) {
      const atendimento = await this.repo.findAtendimentoBasicsByUuid(atendUuid);
      if (atendimento === null) {
        throw new NotFoundException({
          code: 'ATENDIMENTO_NOT_FOUND',
          message: 'Atendimento não encontrado.',
        });
      }
      atendimentoId = atendimento.id;
    }

    let pacienteId: bigint | undefined;
    if (query.pacienteUuid !== undefined) {
      const id = await this.repo.findPacienteIdByUuid(query.pacienteUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'PACIENTE_NOT_FOUND',
          message: 'Paciente não encontrado.',
        });
      }
      pacienteId = id;
    }

    const { data, total } = await this.repo.listSolicitacoes({
      page: query.page,
      pageSize: query.pageSize,
      atendimentoId,
      pacienteId,
      urgencia: query.urgencia,
      status: query.status,
      rangeInicio: query.rangeInicio,
      rangeFim: query.rangeFim,
    });

    // N+1 controlado: para cada solicitação, busca itens. Aceitável
    // porque pageSize máx = 100. Em telas com mais demanda, considerar
    // bulk-fetch agregado em uma query única.
    const enriched = await Promise.all(
      data.map(async (row) => {
        const itens = await this.repo.findItensBySolicitacaoId(row.id);
        return presentSolicitacao(row, itens);
      }),
    );

    return {
      data: enriched,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
}
