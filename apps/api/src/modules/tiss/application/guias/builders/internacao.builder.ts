/**
 * Builder — Guia de INTERNACAO (resumo da estadia hospitalar).
 *
 * Carrega itens grupo `DIARIA` + `TAXA` referentes à internação. Os
 * procedimentos cirúrgicos / honorários da internação saem em guias
 * separadas (HONORARIOS / SP_SADT) — esta guia foca na parte
 * "hoteleira" + taxas hospitalares.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type { BuilderContext, BuilderResult } from './builder-context';
import {
  buildAndValidate,
  itensToValidatorInput,
  somarItens,
} from './common-builder';

export function isInternacaoItem(it: ContaItemForGuiaRow): boolean {
  return it.grupo_gasto === 'DIARIA' || it.grupo_gasto === 'TAXA';
}

export function buildInternacao(ctx: BuilderContext): BuilderResult | null {
  // Só faz sentido quando a conta é de internação. Detecção
  // heurística — se não há diária nem taxa, não há guia.
  const itens = ctx.itens.filter(isInternacaoItem);
  if (itens.length === 0) return null;
  const valorTotal = somarItens(itens);
  return buildAndValidate({
    tipo: 'INTERNACAO',
    ctx,
    itens: itensToValidatorInput(itens),
    itensIds: itens.map((i) => i.id),
    valorTotal,
  });
}
