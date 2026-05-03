/**
 * `GET /v1/portal/paciente/agendamentos` — lista próximos + histórico
 * recente do paciente logado.
 *
 * Estratégia simples (sem paginação dura): retornamos dois arrays —
 * `proximos` (status AGENDADO/CONFIRMADO com inicio >= now()) e
 * `historico` (demais, ORDER BY inicio DESC, LIMIT pageSize).
 *
 * Reaproveita o repositório local para não puxar a lógica do
 * `AgendamentoRepository` (que tem JOINs específicos do admin).
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { ListAgendamentosPortalQueryDto } from '../../dto/list-queries.dto';
import type { PortalAgendamentosResponse } from '../../dto/responses';
import { presentAgendamento } from '../presenter';

@Injectable()
export class ListAgendamentosPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    query: ListAgendamentosPortalQueryDto,
  ): Promise<PortalAgendamentosResponse> {
    const ctx = await this.resolver.resolve();
    const pageSize = query.pageSize ?? 50;

    const { data } = await this.repo.listAgendamentosPaciente({
      pacienteId: ctx.pacienteId,
      page: query.page ?? 1,
      pageSize,
      ...(query.inicio !== undefined ? { rangeInicio: query.inicio } : {}),
      ...(query.fim !== undefined ? { rangeFim: query.fim } : {}),
    });

    const now = Date.now();
    const proximos = data.filter(
      (r) =>
        r.inicio.getTime() >= now &&
        ['AGENDADO', 'CONFIRMADO'].includes(r.status),
    );
    const historico = data.filter((r) => !proximos.includes(r));

    return {
      proximos: proximos.map(presentAgendamento),
      historico: historico.map(presentAgendamento),
    };
  }
}
