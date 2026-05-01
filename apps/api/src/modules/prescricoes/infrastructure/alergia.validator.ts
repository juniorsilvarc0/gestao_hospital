/**
 * `AlergiaValidator` — RN-PEP-05.
 *
 * Confronta `pacientes.alergias JSONB` (formato `[{substancia,
 * gravidade, observacao}]`) com os princípios ativos de cada
 * `procedimentoId` da prescrição. A comparação é case-insensitive +
 * unaccent (Postgres `unaccent`/`f_unaccent` se disponível, fallback
 * `lower()` + normalização JS).
 *
 * Retorno = lista de alertas. Se vazia, sem alergia detectada → o use
 * case prossegue. Se não vazia, o use case bloqueia o INSERT a menos
 * que `body.overrides.alergia` esteja presente E o usuário possua a
 * permissão `prescricoes:override-alergia`.
 *
 * Esta validação é **bloqueante** (CLAUDE.md §2.2): ignorar exige
 * registro explícito (justificativa + autor) — o que vai para o JSONB
 * `prescricoes_itens.alerta_alergia`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface AlergiaInput {
  pacienteId: bigint;
  procedimentoIds: bigint[];
}

export interface AlergiaDetectada {
  procedimentoId: bigint;
  procedimentoUuid: string;
  principioId: bigint;
  principio: string;
  alergia: {
    substancia: string;
    gravidade: string | null;
    observacao: string | null;
  };
}

interface PacienteAlergiaRaw {
  substancia: string;
  gravidade?: string | null;
  observacao?: string | null;
}

interface ProcedimentoPrincipioRow {
  procedimento_id: bigint;
  procedimento_uuid: string;
  principio_id: bigint;
  principio_nome: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    // remove diacríticos
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

@Injectable()
export class AlergiaValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validar(input: AlergiaInput): Promise<AlergiaDetectada[]> {
    if (input.procedimentoIds.length === 0) return [];

    const tx = this.prisma.tx();

    const alergiaRows = await tx.$queryRaw<{ alergias: unknown }[]>`
      SELECT alergias FROM pacientes
       WHERE id = ${input.pacienteId}::bigint AND deleted_at IS NULL
       LIMIT 1
    `;
    if (alergiaRows.length === 0) return [];
    const raw = alergiaRows[0].alergias;
    const alergias = Array.isArray(raw) ? (raw as PacienteAlergiaRaw[]) : [];
    if (alergias.length === 0) return [];

    // Substância normalizada → metadados originais (preserva acentos
    // e gravidade para retornar no alerta).
    const idxAlergia = new Map<string, PacienteAlergiaRaw>();
    for (const a of alergias) {
      if (typeof a?.substancia === 'string' && a.substancia.length > 0) {
        idxAlergia.set(normalize(a.substancia), a);
      }
    }
    if (idxAlergia.size === 0) return [];

    const principios = await tx.$queryRaw<ProcedimentoPrincipioRow[]>`
      SELECT pa.procedimento_id      AS procedimento_id,
             tp.uuid_externo::text   AS procedimento_uuid,
             pri.id                  AS principio_id,
             pri.nome                AS principio_nome
        FROM procedimento_principio_ativo pa
        JOIN principios_ativos pri      ON pri.id = pa.principio_id AND pri.ativo
        JOIN tabelas_procedimentos tp   ON tp.id = pa.procedimento_id
       WHERE pa.procedimento_id = ANY(${input.procedimentoIds}::bigint[])
    `;

    const out: AlergiaDetectada[] = [];
    for (const row of principios) {
      const hit = idxAlergia.get(normalize(row.principio_nome));
      if (hit !== undefined) {
        out.push({
          procedimentoId: row.procedimento_id,
          procedimentoUuid: row.procedimento_uuid,
          principioId: row.principio_id,
          principio: row.principio_nome,
          alergia: {
            substancia: hit.substancia,
            gravidade: hit.gravidade ?? null,
            observacao: hit.observacao ?? null,
          },
        });
      }
    }
    return out;
  }
}
