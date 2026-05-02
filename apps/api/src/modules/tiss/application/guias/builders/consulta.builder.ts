/**
 * Builder — Guia de CONSULTA.
 *
 * Critério de inclusão: itens grupo `PROCEDIMENTO` cuja `origem` seja
 * `MANUAL` ou `PEP` (consultas ambulatoriais lançam pelo PEP). A guia
 * de consulta tipicamente carrega 1 procedimento (consulta médica),
 * mas aceitamos N — o validador exige ≥1.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type { BuilderContext, BuilderResult } from './builder-context';
import {
  buildAndValidate,
  itensToValidatorInput,
  somarItens,
} from './common-builder';

export function isConsultaItem(it: ContaItemForGuiaRow): boolean {
  return (
    it.grupo_gasto === 'PROCEDIMENTO' &&
    (it.origem === 'PEP' || it.origem === 'MANUAL')
  );
}

export function buildConsulta(ctx: BuilderContext): BuilderResult | null {
  const itens = ctx.itens.filter(isConsultaItem);
  if (itens.length === 0) return null;
  const valorTotal = somarItens(itens);
  return buildAndValidate({
    tipo: 'CONSULTA',
    ctx,
    itens: itensToValidatorInput(itens),
    itensIds: itens.map((i) => i.id),
    valorTotal,
  });
}
