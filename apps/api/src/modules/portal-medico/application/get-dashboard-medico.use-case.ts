/**
 * `GET /v1/portal/medico/dashboard` — agregado da home do portal.
 *
 * Resumão:
 *   - hoje: agendamentos / cirurgias / laudos pendentes
 *   - semana: agendamentos / cirurgias (próximos 7 dias)
 *   - competência atual: repasse + total de produção (qtd + valor)
 *   - próximas 5 atividades (consultas + cirurgias) ordenadas por data
 *
 * Implementação: paraleliza todos os counts/queries para reduzir
 * round-trips. As queries são intencionalmente simples (count) — o
 * dashboard não precisa de detalhes, só números.
 */
import { Injectable } from '@nestjs/common';

import { RepasseRepository } from '../../repasse/infrastructure/repasse.repository';
import {
  currentCompetencia,
  nextDaysRange,
  todayRange,
} from '../domain/medico-context';
import type {
  DashboardMedicoResponse,
  DashboardProximaItem,
} from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';

@Injectable()
export class GetDashboardMedicoUseCase {
  constructor(
    private readonly repo: PortalMedicoRepository,
    private readonly repasseRepo: RepasseRepository,
  ) {}

  async execute(
    ctx: MedicoRequestContext,
  ): Promise<DashboardMedicoResponse> {
    const now = new Date();
    const hoje = todayRange(now);
    const semana = nextDaysRange(7, now);
    const competencia = currentCompetencia(now);

    const [
      agendamentosHoje,
      cirurgiasHoje,
      laudosPendentes,
      agendamentosSemana,
      cirurgiasSemana,
      proximasCirurgias,
      proximaConsulta,
      repasseAtual,
      producaoTotais,
    ] = await Promise.all([
      this.repo.countAgendamentosRange({
        prestadorId: ctx.prestadorId,
        inicio: hoje.inicio,
        fim: hoje.fim,
      }),
      this.repo.countCirurgiasRange({
        prestadorId: ctx.prestadorId,
        inicio: hoje.inicio,
        fim: hoje.fim,
      }),
      this.repo.countLaudosPendentes(ctx.prestadorId),
      this.repo.countAgendamentosRange({
        prestadorId: ctx.prestadorId,
        inicio: semana.inicio,
        fim: semana.fim,
      }),
      this.repo.countCirurgiasRange({
        prestadorId: ctx.prestadorId,
        inicio: semana.inicio,
        fim: semana.fim,
      }),
      this.repo.findCirurgiasDoMedico({
        prestadorId: ctx.prestadorId,
        inicio: now.toISOString(),
        fim: semana.fim,
      }),
      this.repo.findProximaConsulta(ctx.prestadorId, now.toISOString()),
      this.repasseRepo.findRepassePorPrestadorCompetencia(
        ctx.prestadorId,
        competencia,
      ),
      this.repo.findProducaoTotais({
        prestadorId: ctx.prestadorId,
        competencia,
      }),
    ]);

    // ─── proximas (top 5) ───
    const proximas: DashboardProximaItem[] = [];
    if (proximaConsulta !== null) {
      proximas.push({
        tipo: 'consulta',
        uuid: proximaConsulta.agendamento_uuid,
        data: proximaConsulta.inicio.toISOString(),
        pacienteUuid: proximaConsulta.paciente_uuid,
        pacienteNome: proximaConsulta.paciente_nome,
        observacao: null,
      });
    }
    for (const cir of proximasCirurgias.slice(0, 10)) {
      proximas.push({
        tipo: 'cirurgia',
        uuid: cir.uuid_externo,
        data: cir.data_hora_agendada.toISOString(),
        pacienteUuid: cir.paciente_uuid,
        pacienteNome: cir.paciente_nome,
        observacao: cir.procedimento_principal_nome,
      });
    }
    proximas.sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
    );
    const top5 = proximas.slice(0, 5);

    // ─── valor total de produção ───
    // Soma de `valor_total` de contas_itens executadas + `valor_calculado`
    // de itens de repasse. Para o dashboard consolidamos em "valor da
    // produção" usando os totais já calculados pelo repasse (mais fiel
    // ao que o médico vai receber).
    const valorTotal =
      repasseAtual === null
        ? '0.0000'
        : repasseAtual.valor_bruto;
    const qtdTotal =
      producaoTotais.total_atendimentos +
      producaoTotais.total_cirurgias +
      producaoTotais.total_laudos;

    return {
      hoje: {
        agendamentos: agendamentosHoje,
        cirurgias: cirurgiasHoje,
        laudosPendentes,
      },
      semana: {
        agendamentos: agendamentosSemana,
        cirurgias: cirurgiasSemana,
      },
      competenciaAtual: {
        competencia,
        repasse:
          repasseAtual === null
            ? null
            : {
                uuid: repasseAtual.uuid_externo,
                status: repasseAtual.status,
                valorLiquido: repasseAtual.valor_liquido,
                qtdItens: Number(repasseAtual.qtd_itens),
              },
        producaoTotal: {
          qtd: qtdTotal,
          valor: valorTotal,
        },
      },
      proximas: top5,
    };
  }
}
