/**
 * Builder — Guia SP/SADT (Serviços Profissionais / Serviço Auxiliar de
 * Diagnóstico e Terapia).
 *
 * Critério: itens grupo `PROCEDIMENTO` originados de `EXAME` ou
 * `CIRURGIA` (procedimentos não-consulta). É a guia mais comum em
 * atendimentos ambulatoriais.
 *
 * O modelo TISS oficial pede dados específicos (CBO solicitante, etc.)
 * que serão acrescentados na Fase 13 quando ligarmos o XSD oficial.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type { BuilderContext, BuilderResult } from './builder-context';
import {
  buildAndValidate,
  itensToValidatorInput,
  somarItens,
} from './common-builder';

export function isSpSadtItem(it: ContaItemForGuiaRow): boolean {
  if (it.grupo_gasto !== 'PROCEDIMENTO') return false;
  // Exclui consultas (essas vão na guia CONSULTA).
  return it.origem !== 'PEP' && it.origem !== 'MANUAL';
}

export function buildSpSadt(ctx: BuilderContext): BuilderResult | null {
  const itens = ctx.itens.filter(isSpSadtItem);
  if (itens.length === 0) return null;
  const valorTotal = somarItens(itens);
  return buildAndValidate({
    tipo: 'SP_SADT',
    ctx,
    itens: itensToValidatorInput(itens),
    itensIds: itens.map((i) => i.id),
    valorTotal,
  });
}
