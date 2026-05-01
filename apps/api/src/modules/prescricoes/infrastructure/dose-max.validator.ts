/**
 * `DoseMaxValidator` — RN-PRE-07.
 *
 * Calcula a dose total/dia do item e compara com
 * `principios_ativos.dose_max_dia`.
 *
 * Parser de frequência (best-effort para o seed atual):
 *   - "8/8h"   → 24/8  = 3 vezes/dia
 *   - "12/12h" → 24/12 = 2
 *   - "1x/dia" → 1
 *   - "2x/dia" → 2
 *   - "3x/dia" → 3
 *   - "SOS"    → 0   (não conta — `seNecessario`)
 *   - vazio    → 1   (assume-se dose única quando não declara)
 *
 * Parser de dose (string `"500mg"`/`"10ml"`/`"1g"`):
 *   - Extrai número + unidade. Se a unidade do item bater com
 *     `principios_ativos.unidade_dose` (case-insensitive), comparamos
 *     direto. Se `dose` for "1 g" e `unidade_dose` "mg", convertemos
 *     g→mg (×1000). Para outras unidades sem conversão conhecida, o
 *     validator é conservador: NÃO bloqueia (loga warning) — preferimos
 *     deixar passar a falsamente travar uma prescrição válida (e o
 *     farmacêutico pega na análise).
 *
 * Saída: lista de itens que excederam a dose máxima diária. Vazia →
 * sem problema. Não vazia → bloqueante; o use case exige
 * `overrides.doseMax` + permissão `prescricoes:override-dose`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface DoseMaxItemInput {
  /** id ou índice estável para mapear de volta o erro ao item. */
  itemKey: string;
  procedimentoId: bigint;
  procedimentoUuid: string;
  /** "500mg", "1 g", "10ml" — pode ser null se não-medicamento. */
  dose: string | null;
  /** "8/8h", "1x/dia", "SOS", null. */
  frequencia: string | null;
  /** unidade declarada no item (se diferente da extraída de `dose`). */
  unidadeMedida: string | null;
  /** `seNecessario` (SOS) → não conta. */
  seNecessario: boolean;
}

export interface DoseMaxInput {
  items: DoseMaxItemInput[];
}

export interface DoseMaxExcedida {
  itemKey: string;
  procedimentoId: bigint;
  procedimentoUuid: string;
  principio: string;
  doseSolicitada: number;
  unidade: string;
  doseMaxDia: number;
  unidadeMaxima: string;
  vezesPorDia: number;
}

interface PrincipioRow {
  procedimento_id: bigint;
  procedimento_uuid: string;
  principio_nome: string;
  dose_max_dia: string | null;        // numeric → string em raw query
  unidade_dose: string | null;
}

const FREQ_X_DIA = /^\s*(\d+)\s*x\s*\/\s*dia\s*$/i;
const FREQ_N_N_H = /^\s*(\d+)\s*\/\s*(\d+)\s*h\s*$/i;
const DOSE_NUM_UNIT = /^\s*([\d.,]+)\s*([A-Za-zµμ]+)\s*$/;

const UNIT_TO_MG: Record<string, number> = {
  g: 1000,
  mg: 1,
  mcg: 0.001,
  µg: 0.001,
  μg: 0.001,
};
const UNIT_TO_ML: Record<string, number> = {
  l: 1000,
  ml: 1,
};

export function parseFrequencia(freq: string | null): number {
  if (freq === null) return 1;
  const t = freq.trim();
  if (t.length === 0) return 1;
  if (t.toUpperCase() === 'SOS') return 0;
  const m1 = FREQ_X_DIA.exec(t);
  if (m1 !== null) return Math.max(0, Number.parseInt(m1[1], 10));
  const m2 = FREQ_N_N_H.exec(t);
  if (m2 !== null) {
    const horas = Number.parseInt(m2[2], 10);
    if (horas > 0 && 24 % horas === 0) return 24 / horas;
    if (horas > 0) return Math.floor(24 / horas);
  }
  return 1;
}

export interface DoseAmount {
  value: number;
  unit: string;
}

export function parseDose(dose: string | null): DoseAmount | null {
  if (dose === null) return null;
  const m = DOSE_NUM_UNIT.exec(dose.trim());
  if (m === null) return null;
  const v = Number.parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return { value: v, unit: m[2].toLowerCase() };
}

/**
 * Tenta converter `amount` para a unidade `targetUnit` (case-insensitive).
 * Retorna `null` se não houver conversão conhecida — chamador é
 * conservador (não bloqueia).
 */
export function convertUnit(
  amount: DoseAmount,
  targetUnit: string,
): number | null {
  const a = amount.unit.toLowerCase();
  const b = targetUnit.toLowerCase();
  if (a === b) return amount.value;
  if (a in UNIT_TO_MG && b in UNIT_TO_MG) {
    return (amount.value * UNIT_TO_MG[a]) / UNIT_TO_MG[b];
  }
  if (a in UNIT_TO_ML && b in UNIT_TO_ML) {
    return (amount.value * UNIT_TO_ML[a]) / UNIT_TO_ML[b];
  }
  return null;
}

@Injectable()
export class DoseMaxValidator {
  private readonly logger = new Logger(DoseMaxValidator.name);

  constructor(private readonly prisma: PrismaService) {}

  async validar(input: DoseMaxInput): Promise<DoseMaxExcedida[]> {
    if (input.items.length === 0) return [];

    const ids = Array.from(new Set(input.items.map((i) => i.procedimentoId)));
    const tx = this.prisma.tx();
    const principios = await tx.$queryRaw<PrincipioRow[]>`
      SELECT pa.procedimento_id        AS procedimento_id,
             tp.uuid_externo::text     AS procedimento_uuid,
             pri.nome                  AS principio_nome,
             pri.dose_max_dia::text    AS dose_max_dia,
             pri.unidade_dose          AS unidade_dose
        FROM procedimento_principio_ativo pa
        JOIN principios_ativos pri    ON pri.id = pa.principio_id AND pri.ativo
        JOIN tabelas_procedimentos tp ON tp.id = pa.procedimento_id
       WHERE pa.procedimento_id = ANY(${ids}::bigint[])
         AND pri.dose_max_dia IS NOT NULL
    `;
    if (principios.length === 0) return [];

    const byProc = new Map<string, PrincipioRow[]>();
    for (const p of principios) {
      const k = p.procedimento_id.toString();
      const arr = byProc.get(k);
      if (arr === undefined) byProc.set(k, [p]);
      else arr.push(p);
    }

    const out: DoseMaxExcedida[] = [];
    for (const item of input.items) {
      if (item.seNecessario) continue;
      const list = byProc.get(item.procedimentoId.toString());
      if (list === undefined) continue;

      const vezes = parseFrequencia(item.frequencia);
      if (vezes === 0) continue;
      const parsed = parseDose(item.dose);
      if (parsed === null) {
        this.logger.debug(
          { itemKey: item.itemKey },
          'dose-max: dose unparseable, skipping',
        );
        continue;
      }

      for (const p of list) {
        if (p.dose_max_dia === null || p.unidade_dose === null) continue;
        const max = Number.parseFloat(p.dose_max_dia);
        if (!Number.isFinite(max) || max <= 0) continue;
        const converted = convertUnit(parsed, p.unidade_dose);
        if (converted === null) {
          this.logger.debug(
            { itemKey: item.itemKey, from: parsed.unit, to: p.unidade_dose },
            'dose-max: unidade incompatível — pulando (conservador)',
          );
          continue;
        }
        const totalDia = converted * vezes;
        if (totalDia > max) {
          out.push({
            itemKey: item.itemKey,
            procedimentoId: item.procedimentoId,
            procedimentoUuid: item.procedimentoUuid,
            principio: p.principio_nome,
            doseSolicitada: totalDia,
            unidade: p.unidade_dose,
            doseMaxDia: max,
            unidadeMaxima: p.unidade_dose,
            vezesPorDia: vezes,
          });
          break; // basta um princípio violando para sinalizar o item.
        }
      }
    }
    return out;
  }
}
