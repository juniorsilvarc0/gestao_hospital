/**
 * Apresentador de `tabelas_procedimentos`. Centraliza a serialização
 * dos campos `Decimal` (Prisma) → string (JSON) e `BigInt` → string.
 */
import type { Prisma } from '@prisma/client';

import type { ProcedimentoResponse } from '../../dto/procedimento.response';

export interface ProcedimentoRow {
  id: bigint;
  uuid_externo: string;
  codigo_tuss: string;
  codigo_cbhpm: string | null;
  codigo_amb: string | null;
  codigo_sus: string | null;
  codigo_anvisa: string | null;
  codigo_ean: string | null;
  nome: string;
  nome_reduzido: string | null;
  tipo: string;
  grupo_gasto: string;
  tabela_tiss: string | null;
  unidade_medida: string | null;
  fator_conversao: Prisma.Decimal | null;
  valor_referencia: Prisma.Decimal | null;
  porte: string | null;
  custo_operacional: Prisma.Decimal | null;
  precisa_autorizacao: boolean;
  precisa_assinatura: boolean;
  precisa_lote: boolean;
  controlado: boolean;
  alto_custo: boolean;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export function presentProcedimento(p: ProcedimentoRow): ProcedimentoResponse {
  return {
    id: p.id.toString(),
    uuid: p.uuid_externo,
    codigoTuss: p.codigo_tuss,
    codigoCbhpm: p.codigo_cbhpm,
    codigoAmb: p.codigo_amb,
    codigoSus: p.codigo_sus,
    codigoAnvisa: p.codigo_anvisa,
    codigoEan: p.codigo_ean,
    nome: p.nome,
    nomeReduzido: p.nome_reduzido,
    tipo: p.tipo,
    grupoGasto: p.grupo_gasto,
    tabelaTiss: p.tabela_tiss,
    unidadeMedida: p.unidade_medida,
    fatorConversao: p.fator_conversao !== null ? p.fator_conversao.toString() : null,
    valorReferencia:
      p.valor_referencia !== null ? p.valor_referencia.toString() : null,
    porte: p.porte,
    custoOperacional:
      p.custo_operacional !== null ? p.custo_operacional.toString() : null,
    precisaAutorizacao: p.precisa_autorizacao,
    precisaAssinatura: p.precisa_assinatura,
    precisaLote: p.precisa_lote,
    controlado: p.controlado,
    altoCusto: p.alto_custo,
    ativo: p.ativo,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at !== null ? p.updated_at.toISOString() : null,
  };
}
