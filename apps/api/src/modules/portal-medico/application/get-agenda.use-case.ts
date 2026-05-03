/**
 * `GET /v1/portal/medico/agenda` — lista de agendamentos do médico
 * (todos os recursos do tipo PRESTADOR vinculados a ele).
 *
 * Default: hoje + próximos 7 dias. Reaproveita
 * `AgendamentoRepository.listAgendamentos` por recurso, agregando o
 * resultado quando o médico está em mais de um recurso.
 *
 * Status excluídos: CANCELADO/REAGENDADO (não fazem sentido na
 * agenda do dia-a-dia do médico).
 */
import { Injectable } from '@nestjs/common';

import { AgendamentoRepository } from '../../agendamento/infrastructure/agendamento.repository';
import { nextDaysRange } from '../domain/medico-context';
import type { AgendaQueryDto } from '../dto/agenda-query.dto';
import type { AgendaResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';
import { attachPacienteNome, presentAgendaItem } from './presenter';

const ACTIVE_STATUS = ['AGENDADO', 'CONFIRMADO', 'COMPARECEU', 'FALTOU'];

@Injectable()
export class GetAgendaUseCase {
  constructor(
    private readonly repo: PortalMedicoRepository,
    private readonly agendamentoRepo: AgendamentoRepository,
  ) {}

  async execute(
    ctx: MedicoRequestContext,
    query: AgendaQueryDto,
  ): Promise<AgendaResponse> {
    const range = resolveRange(query);
    const recursoIds = await this.repo.findRecursoIdsByPrestador(
      ctx.prestadorId,
    );
    if (recursoIds.length === 0) {
      return { dataInicio: range.inicio, dataFim: range.fim, data: [] };
    }

    // Buscamos por recurso e agregamos. Como o paciente médio aparece
    // em 1-2 recursos, isso é cheap e evita ter de duplicar SQL.
    const agendamentos = await Promise.all(
      recursoIds.map((rid) =>
        this.agendamentoRepo.listAgendamentos({
          page: 1,
          pageSize: 200,
          recursoId: rid,
          rangeInicio: range.inicio,
          rangeFim: range.fim,
          status: ACTIVE_STATUS,
        }),
      ),
    );

    const flatRows = agendamentos.flatMap((r) => r.data);
    flatRows.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

    // Lookup batched de nomes de paciente.
    const pacienteUuids = Array.from(
      new Set(flatRows.map((r) => r.paciente_uuid)),
    );
    const nomesMap = await this.repo.findPacientesNomesByUuids(pacienteUuids);

    const data = flatRows
      .map(presentAgendaItem)
      .map((item) => attachPacienteNome(item, nomesMap));

    return { dataInicio: range.inicio, dataFim: range.fim, data };
  }
}

function resolveRange(query: AgendaQueryDto): {
  inicio: string;
  fim: string;
} {
  if (query.dataInicio !== undefined && query.dataFim !== undefined) {
    return { inicio: query.dataInicio, fim: query.dataFim };
  }
  // Default: hoje + 7 dias inteiros.
  const def = nextDaysRange(7);
  return {
    inicio: query.dataInicio ?? def.inicio,
    fim: query.dataFim ?? def.fim,
  };
}
