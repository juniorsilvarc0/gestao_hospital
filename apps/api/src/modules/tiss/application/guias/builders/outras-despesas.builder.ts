/**
 * Builder — Guia OUTRAS_DESPESAS (matmed + gases medicinais).
 *
 * Carrega itens grupo `MATERIAL`, `MEDICAMENTO` e `GAS`. OPME tem guia
 * dedicada (`ANEXO_OPME`) — aqui não entra.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type { BuilderContext, BuilderResult } from './builder-context';
import {
  buildAndValidate,
  itensToValidatorInput,
  somarItens,
} from './common-builder';

export function isOutrasDespesasItem(it: ContaItemForGuiaRow): boolean {
  return (
    it.grupo_gasto === 'MATERIAL' ||
    it.grupo_gasto === 'MEDICAMENTO' ||
    it.grupo_gasto === 'GAS'
  );
}

export function buildOutrasDespesas(
  ctx: BuilderContext,
): BuilderResult | null {
  const itens = ctx.itens.filter(isOutrasDespesasItem);
  if (itens.length === 0) return null;
  const valorTotal = somarItens(itens);
  return buildAndValidate({
    tipo: 'OUTRAS_DESPESAS',
    ctx,
    itens: itensToValidatorInput(itens),
    itensIds: itens.map((i) => i.id),
    valorTotal,
  });
}
