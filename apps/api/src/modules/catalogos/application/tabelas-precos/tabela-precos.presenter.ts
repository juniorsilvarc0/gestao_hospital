/**
 * Apresentador de tabelas de preços e seus itens.
 */
import type { Prisma } from '@prisma/client';

import type {
  TabelaPrecosItemResponse,
  TabelaPrecosResponse,
} from '../../dto/tabela-precos.response';

export interface TabelaPrecosRow {
  id: bigint;
  codigo: string;
  nome: string;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  versao: number;
  ativa: boolean;
  created_at: Date;
  itens_count?: bigint;
}

export interface TabelaPrecosItemRow {
  id: bigint;
  procedimento_id: bigint;
  procedimento_codigo_tuss: string;
  procedimento_nome: string;
  valor: Prisma.Decimal;
  valor_filme: Prisma.Decimal | null;
  porte_anestesico: string | null;
  tempo_minutos: number | null;
  custo_operacional: Prisma.Decimal | null;
  observacao: string | null;
}

export function presentTabela(t: TabelaPrecosRow): TabelaPrecosResponse {
  return {
    id: t.id.toString(),
    codigo: t.codigo,
    nome: t.nome,
    vigenciaInicio: t.vigencia_inicio.toISOString().slice(0, 10),
    vigenciaFim:
      t.vigencia_fim !== null ? t.vigencia_fim.toISOString().slice(0, 10) : null,
    versao: t.versao,
    ativa: t.ativa,
    createdAt: t.created_at.toISOString(),
    itensCount: t.itens_count !== undefined ? Number(t.itens_count) : undefined,
  };
}

export function presentItem(i: TabelaPrecosItemRow): TabelaPrecosItemResponse {
  return {
    id: i.id.toString(),
    procedimentoId: i.procedimento_id.toString(),
    procedimentoCodigoTuss: i.procedimento_codigo_tuss,
    procedimentoNome: i.procedimento_nome,
    valor: i.valor.toString(),
    valorFilme: i.valor_filme !== null ? i.valor_filme.toString() : null,
    porteAnestesico: i.porte_anestesico,
    tempoMinutos: i.tempo_minutos,
    custoOperacional:
      i.custo_operacional !== null ? i.custo_operacional.toString() : null,
    observacao: i.observacao,
  };
}
