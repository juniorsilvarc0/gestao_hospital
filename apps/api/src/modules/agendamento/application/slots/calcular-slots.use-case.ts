/**
 * Cálculo de slots (`GET /v1/agenda/:recursoUuid?inicio=&fim=`).
 *
 * Algoritmo (O(D × S)):
 *   1. Carrega o recurso → `intervalo_minutos`.
 *   2. Carrega disponibilidades vigentes na faixa.
 *   3. Carrega bloqueios sobrepostos.
 *   4. Carrega agendamentos ocupando (status ∉ CANCELADO/REAGENDADO,
 *      encaixe = FALSE — encaixes não bloqueiam slot).
 *   5. Para cada dia entre [inicio, fim]:
 *      - Resolve a janela de disponibilidade (`data_especifica` precede
 *        `dia_semana`; ambas respeitam `vigencia_*`).
 *      - Constrói slots `[t, t + intervalo)` enquanto `t + intervalo
 *        <= horaFim`.
 *      - Marca cada slot como `BLOQUEIO` se intersecta bloqueio, ou
 *        `OCUPADO` se intersecta agendamento.
 *
 * Limites:
 *   - Janela máxima 60 dias (proteção contra varredura).
 *   - `fim > inicio`.
 *
 * Retorno: `{recursoUuid, intervaloMinutos, inicio, fim, slots[]}`.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  SlotResponse,
  SlotsRangeResponse,
} from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import type {
  AgendamentoOcupadoRow,
  BloqueioRow,
  DisponibilidadeRow,
  SlotInternal,
} from './slot.types';

export interface CalcularSlotsParams {
  recursoUuid: string;
  inicio: string; // ISO
  fim: string; // ISO
  incluirOcupados?: boolean;
}

const MAX_DIAS = 60;
const MS_DIA = 24 * 60 * 60 * 1000;

@Injectable()
export class CalcularSlotsUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(params: CalcularSlotsParams): Promise<SlotsRangeResponse> {
    const inicio = new Date(params.inicio);
    const fim = new Date(params.fim);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException({
        code: 'SLOTS_DATAS_INVALIDAS',
        message: 'inicio/fim inválidos (use ISO 8601).',
      });
    }
    if (fim.getTime() <= inicio.getTime()) {
      throw new BadRequestException({
        code: 'SLOTS_PERIODO_INVALIDO',
        message: 'fim deve ser maior que inicio.',
      });
    }
    const dias = Math.ceil((fim.getTime() - inicio.getTime()) / MS_DIA);
    if (dias > MAX_DIAS) {
      throw new BadRequestException({
        code: 'SLOTS_PERIODO_EXCEDE_LIMITE',
        message: `Janela máxima é de ${MAX_DIAS} dias.`,
      });
    }

    const recursoId = await this.repo.findRecursoIdByUuid(params.recursoUuid);
    if (recursoId === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }
    const meta = await this.repo.findRecursoMeta(recursoId);
    if (meta === null) {
      throw new NotFoundException({ code: 'RECURSO_NOT_FOUND' });
    }

    const [disponibilidades, bloqueios, ocupados] = await Promise.all([
      this.repo.listDisponibilidadeRange(recursoId, inicio, fim),
      this.repo.listBloqueiosRange(recursoId, inicio, fim),
      this.repo.listAgendamentosOcupados(recursoId, inicio, fim),
    ]);

    const slots = computeSlots({
      inicio,
      fim,
      intervaloMinutos: meta.intervaloMinutos,
      disponibilidades,
      bloqueios,
      ocupados,
    });

    const filtered =
      params.incluirOcupados === true
        ? slots
        : slots.filter((s) => s.disponivel);

    return {
      recursoUuid: params.recursoUuid,
      intervaloMinutos: meta.intervaloMinutos,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      slots: filtered.map(toResponse),
    };
  }
}

function toResponse(s: SlotInternal): SlotResponse {
  return {
    inicio: s.inicio.toISOString(),
    fim: s.fim.toISOString(),
    disponivel: s.disponivel,
    motivoIndisponibilidade: s.motivoIndisponibilidade,
  };
}

// ────────────────────────────────────────────────────────────────────
// FUNÇÃO PURA — sem Prisma/Nest. Testável unitariamente.
// ────────────────────────────────────────────────────────────────────

export interface ComputeSlotsInput {
  inicio: Date;
  fim: Date;
  intervaloMinutos: number;
  disponibilidades: DisponibilidadeRow[];
  bloqueios: BloqueioRow[];
  ocupados: AgendamentoOcupadoRow[];
}

/**
 * Função pura: dado o range solicitado e os dados do recurso, devolve
 * a lista de slots ordenada por início. Cada slot tem flag de
 * disponibilidade e motivo (BLOQUEIO/OCUPADO/null quando livre).
 */
export function computeSlots(input: ComputeSlotsInput): SlotInternal[] {
  const { intervaloMinutos } = input;
  const stepMs = intervaloMinutos * 60 * 1000;
  const slots: SlotInternal[] = [];

  // Itera dia a dia em UTC (truncar por dia evita drift de DST).
  const startDay = atStartOfUtcDay(input.inicio);
  const endDay = atStartOfUtcDay(new Date(input.fim.getTime() - 1));

  for (
    let dia = new Date(startDay);
    dia.getTime() <= endDay.getTime();
    dia = new Date(dia.getTime() + MS_DIA)
  ) {
    const janelas = janelasDoDia(input.disponibilidades, dia);
    for (const j of janelas) {
      // Constrói slots dentro da janela.
      const inicioJanela = new Date(dia.getTime() + j.startMs);
      const fimJanela = new Date(dia.getTime() + j.endMs);

      for (
        let t = inicioJanela.getTime();
        t + stepMs <= fimJanela.getTime();
        t += stepMs
      ) {
        const slotInicio = new Date(t);
        const slotFim = new Date(t + stepMs);

        // Aparar contra a janela solicitada.
        if (
          slotFim.getTime() <= input.inicio.getTime() ||
          slotInicio.getTime() >= input.fim.getTime()
        ) {
          continue;
        }

        let motivo: 'BLOQUEIO' | 'OCUPADO' | null = null;
        if (intersectaAlgum(slotInicio, slotFim, input.bloqueios)) {
          motivo = 'BLOQUEIO';
        } else if (intersectaAlgum(slotInicio, slotFim, input.ocupados)) {
          motivo = 'OCUPADO';
        }

        slots.push({
          inicio: slotInicio,
          fim: slotFim,
          disponivel: motivo === null,
          motivoIndisponibilidade: motivo,
        });
      }
    }
  }

  slots.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  return slots;
}

interface JanelaMs {
  startMs: number;
  endMs: number;
}

function janelasDoDia(
  disp: DisponibilidadeRow[],
  diaUtc: Date,
): JanelaMs[] {
  const dataIso = diaUtc.toISOString().slice(0, 10);
  // Especificas têm prioridade. Se houver pelo menos uma para o dia,
  // ignora as semanais (caso padrão: feriado parcial sobrepõe rotina).
  const especificas = disp.filter((d) => {
    if (d.data_especifica === null) return false;
    const ds = new Date(d.data_especifica).toISOString().slice(0, 10);
    return ds === dataIso && respeitaVigencia(d, diaUtc);
  });
  if (especificas.length > 0) {
    return especificas.map(toJanela);
  }
  // Fallback semanal.
  const dow = diaUtc.getUTCDay();
  return disp
    .filter(
      (d) =>
        d.dia_semana !== null &&
        d.dia_semana === dow &&
        respeitaVigencia(d, diaUtc),
    )
    .map(toJanela);
}

function respeitaVigencia(d: DisponibilidadeRow, dia: Date): boolean {
  if (d.vigencia_inicio !== null) {
    const vi = new Date(d.vigencia_inicio);
    if (dia.getTime() < atStartOfUtcDay(vi).getTime()) return false;
  }
  if (d.vigencia_fim !== null) {
    const vf = new Date(d.vigencia_fim);
    if (dia.getTime() > atStartOfUtcDay(vf).getTime()) return false;
  }
  return true;
}

function toJanela(d: DisponibilidadeRow): JanelaMs {
  return {
    startMs: timeOfDayMs(d.hora_inicio),
    endMs: timeOfDayMs(d.hora_fim),
  };
}

function timeOfDayMs(t: Date): number {
  // PG `time` chega como Date com epoch 1970-01-01. Lemos os
  // componentes UTC e convertemos para ms desde 00:00.
  return (
    t.getUTCHours() * 60 * 60 * 1000 +
    t.getUTCMinutes() * 60 * 1000 +
    t.getUTCSeconds() * 1000
  );
}

function atStartOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function intersectaAlgum(
  inicio: Date,
  fim: Date,
  ranges: Array<{ inicio: Date; fim: Date }>,
): boolean {
  for (const r of ranges) {
    const rIni = r.inicio instanceof Date ? r.inicio : new Date(r.inicio);
    const rFim = r.fim instanceof Date ? r.fim : new Date(r.fim);
    // [a, b) intersecta [c, d) ⇔ a < d e c < b
    if (inicio.getTime() < rFim.getTime() && rIni.getTime() < fim.getTime()) {
      return true;
    }
  }
  return false;
}
