/**
 * `InteracaoValidator` — RN-PEP-06.
 *
 * Para cada par de procedimentos (medicamentos) na prescrição, busca
 * em `interacoes_medicamentosas` se existe interação documentada (par
 * é bidirecional — a tabela guarda em ordem `principio_a/principio_b`,
 * mas usamos UNION/OR para olhar nos dois sentidos).
 *
 * Severidades:
 *   - LEVE / MODERADA → retorna o alerta mas NÃO bloqueia (use case
 *     apenas grava em `alerta_interacao`).
 *   - GRAVE / CONTRAINDICADA → bloqueante; exige
 *     `overrides.interacao` + permissão `prescricoes:override-interacao`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export type SeveridadeInteracao =
  | 'LEVE'
  | 'MODERADA'
  | 'GRAVE'
  | 'CONTRAINDICADA';

export interface InteracaoInput {
  procedimentoIds: bigint[];
}

export interface InteracaoDetectada {
  procedimentoIdA: bigint;
  procedimentoIdB: bigint;
  procedimentoUuidA: string;
  procedimentoUuidB: string;
  principioA: string;
  principioB: string;
  severidade: SeveridadeInteracao;
  descricao: string;
  fonte: string | null;
  bloqueante: boolean;
}

interface InteracaoRow {
  procedimento_id_a: bigint;
  procedimento_id_b: bigint;
  procedimento_uuid_a: string;
  procedimento_uuid_b: string;
  principio_a: string;
  principio_b: string;
  severidade: SeveridadeInteracao;
  descricao: string;
  fonte: string | null;
}

function isBloqueante(s: SeveridadeInteracao): boolean {
  return s === 'GRAVE' || s === 'CONTRAINDICADA';
}

@Injectable()
export class InteracaoValidator {
  constructor(private readonly prisma: PrismaService) {}

  async validar(input: InteracaoInput): Promise<InteracaoDetectada[]> {
    if (input.procedimentoIds.length < 2) return [];

    const tx = this.prisma.tx();

    // CTE que materializa par de procedimentos × princípio_ativo.
    // Depois um JOIN simétrico em `interacoes_medicamentosas` com
    // (a,b) OR (b,a). Filtra `procedimento_id_a < procedimento_id_b`
    // para não duplicar (mesma interação aparecendo em ambos sentidos).
    const rows = await tx.$queryRaw<InteracaoRow[]>`
      WITH proc_pri AS (
        SELECT pa.procedimento_id    AS procedimento_id,
               tp.uuid_externo::text AS procedimento_uuid,
               pa.principio_id       AS principio_id,
               pri.nome              AS principio_nome
          FROM procedimento_principio_ativo pa
          JOIN principios_ativos pri    ON pri.id = pa.principio_id AND pri.ativo
          JOIN tabelas_procedimentos tp ON tp.id = pa.procedimento_id
         WHERE pa.procedimento_id = ANY(${input.procedimentoIds}::bigint[])
      ),
      pares AS (
        SELECT pa.procedimento_id    AS procedimento_id_a,
               pa.procedimento_uuid  AS procedimento_uuid_a,
               pa.principio_id       AS principio_id_a,
               pa.principio_nome     AS principio_nome_a,
               pb.procedimento_id    AS procedimento_id_b,
               pb.procedimento_uuid  AS procedimento_uuid_b,
               pb.principio_id       AS principio_id_b,
               pb.principio_nome     AS principio_nome_b
          FROM proc_pri pa
          JOIN proc_pri pb ON pb.procedimento_id > pa.procedimento_id
         WHERE pa.principio_id <> pb.principio_id
      )
      SELECT p.procedimento_id_a,
             p.procedimento_id_b,
             p.procedimento_uuid_a,
             p.procedimento_uuid_b,
             p.principio_nome_a AS principio_a,
             p.principio_nome_b AS principio_b,
             im.severidade,
             im.descricao,
             im.fonte
        FROM pares p
        JOIN interacoes_medicamentosas im
          ON im.ativa
         AND ((im.principio_a = p.principio_id_a AND im.principio_b = p.principio_id_b)
           OR (im.principio_a = p.principio_id_b AND im.principio_b = p.principio_id_a))
    `;

    return rows.map((r) => ({
      procedimentoIdA: r.procedimento_id_a,
      procedimentoIdB: r.procedimento_id_b,
      procedimentoUuidA: r.procedimento_uuid_a,
      procedimentoUuidB: r.procedimento_uuid_b,
      principioA: r.principio_a,
      principioB: r.principio_b,
      severidade: r.severidade,
      descricao: r.descricao,
      fonte: r.fonte,
      bloqueante: isBloqueante(r.severidade),
    }));
  }
}
