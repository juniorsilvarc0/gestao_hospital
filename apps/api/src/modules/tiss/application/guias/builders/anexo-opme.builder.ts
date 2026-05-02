/**
 * Builder — Anexo OPME (Órteses, Próteses e Materiais Especiais).
 *
 * Carrega itens grupo `OPME`. Cada item leva `lote`, `registro_anvisa`
 * e `fabricante` que são obrigatórios para o anexo OPME do TISS. Aqui
 * o `xml-builder` simplificado já escreve esses campos via
 * `codigoTabela` — futuras versões adicionarão tags específicas.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type {
  GuiaItemValidacao,
} from '../../../domain/tiss-validator';
import type { BuilderContext, BuilderResult } from './builder-context';
import { buildAndValidate, somarItens } from './common-builder';

export function isOpmeItem(it: ContaItemForGuiaRow): boolean {
  return it.grupo_gasto === 'OPME';
}

type OpmeItem = GuiaItemValidacao & {
  lote?: string | null;
  registroAnvisa?: string | null;
  fabricante?: string | null;
};

export function buildAnexoOpme(ctx: BuilderContext): BuilderResult | null {
  const itens = ctx.itens.filter(isOpmeItem);
  if (itens.length === 0) return null;

  const validatorItens: OpmeItem[] = itens.map((it) => ({
    codigo: it.procedimento_codigo_tuss,
    codigoTabela: it.tabela_tiss_origem ?? it.procedimento_tabela ?? null,
    quantidade: it.quantidade,
    valorUnitario: it.valor_unitario,
    valorTotal: it.valor_total,
    lote: it.lote,
    registroAnvisa: it.registro_anvisa,
    fabricante: it.fabricante,
  }));

  const valorTotal = somarItens(itens);

  return buildAndValidate({
    tipo: 'ANEXO_OPME',
    ctx,
    itens: validatorItens,
    itensIds: itens.map((i) => i.id),
    valorTotal,
  });
}
