/**
 * Builder — Guia de HONORARIOS médicos.
 *
 * Carrega itens grupo `HONORARIO` (honorários da equipe). Quando o
 * item vem de `origem='CIRURGIA'`, anexamos `<funcao>` (CIRURGIAO,
 * ANESTESISTA, AUXILIAR_1, ...) lido de `cirurgias_equipe.funcao` via
 * o JOIN feito no repositório.
 */
import type { ContaItemForGuiaRow } from '../../../infrastructure/tiss.repository';
import type {
  GuiaItemValidacao,
  GuiaTissValidacaoInput,
} from '../../../domain/tiss-validator';
import type { BuilderContext, BuilderResult } from './builder-context';
import { buildAndValidate, somarItens } from './common-builder';

export function isHonorarioItem(it: ContaItemForGuiaRow): boolean {
  return it.grupo_gasto === 'HONORARIO';
}

/**
 * Como o validator não conhece `funcao`, mantemos os itens no formato
 * padrão. O XML, porém, recebe `<funcao>` via campo extra do builder
 * (não bloqueia validação — funcao é metadado).
 *
 * Estendemos `GuiaItemValidacao` em runtime via tipo de interseção.
 */
type HonorarioItem = GuiaItemValidacao & { funcao?: string | null };

export function buildHonorarios(ctx: BuilderContext): BuilderResult | null {
  const itens = ctx.itens.filter(isHonorarioItem);
  if (itens.length === 0) return null;

  const validatorItens: HonorarioItem[] = itens.map((it) => ({
    codigo: it.procedimento_codigo_tuss,
    codigoTabela: it.tabela_tiss_origem ?? it.procedimento_tabela ?? null,
    quantidade: it.quantidade,
    valorUnitario: it.valor_unitario,
    valorTotal: it.valor_total,
    funcao: it.cirurgia_funcao,
  }));

  const valorTotal = somarItens(itens);

  // Adiciona um marcador no input — embora o `xml-builder` simplificado
  // não escreva `<funcao>` por item, deixamos o campo populado para a
  // futura versão TISS oficial. Quando o XSD oficial for ligado (Fase 13),
  // o builder será estendido para gravar `<funcao>` por item.
  // Aqui o `extra` apenas garante que o validador receba os mesmos itens.
  const extra: Partial<GuiaTissValidacaoInput> = {
    itens: validatorItens,
  };

  return buildAndValidate({
    tipo: 'HONORARIOS',
    ctx,
    itens: validatorItens,
    itensIds: itens.map((i) => i.id),
    valorTotal,
    extra,
  });
}
