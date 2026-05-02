/**
 * Builder — Guia RESUMO_INTERNACAO.
 *
 * Agrupa `valor_diarias + valor_taxas + valor_servicos` em uma única
 * "linha" sintética para o resumo de internação. Aceita também
 * material/medicamento/OPME caso o operador queira incluir um total
 * agregado — a operadora normalmente exige um resumo "macro" antes
 * das guias detalhadas serem auditadas.
 *
 * Usamos `valor_diarias`/`valor_taxas`/`valor_servicos` da própria
 * conta (já calculados pela trigger `tg_atualiza_totais_conta`).
 *
 * Como NÃO há itens 1:1 (é resumo), criamos itens sintéticos sem
 * vincular `contas_itens.guia_tiss_id` — `itensIds` retorna vazio.
 */
import type { BuilderContext, BuilderResult } from './builder-context';
import { buildAndValidate } from './common-builder';

interface ResumoLinha {
  codigo: string;
  descricao: string;
  valor: string;
}

function buildLinhas(ctx: BuilderContext): ResumoLinha[] {
  const itens = ctx.itens;
  const acc: Record<string, number> = {};
  for (const it of itens) {
    const key = it.grupo_gasto;
    acc[key] = (acc[key] ?? 0) + Number(it.valor_total);
  }
  const linhas: ResumoLinha[] = [];
  for (const [grupo, total] of Object.entries(acc)) {
    if (!Number.isFinite(total) || total <= 0) continue;
    linhas.push({
      codigo: `RES-${grupo}`,
      descricao: `Resumo ${grupo}`,
      valor: total.toFixed(4),
    });
  }
  return linhas;
}

export function buildResumoInternacao(
  ctx: BuilderContext,
): BuilderResult | null {
  const linhas = buildLinhas(ctx);
  if (linhas.length === 0) return null;

  const itensInput = linhas.map((l) => ({
    codigo: l.codigo,
    codigoTabela: 'INTERNO',
    quantidade: '1',
    valorUnitario: l.valor,
    valorTotal: l.valor,
  }));

  const valorTotalNum = linhas.reduce((acc, l) => acc + Number(l.valor), 0);
  const valorTotal = valorTotalNum.toFixed(4);

  return buildAndValidate({
    tipo: 'RESUMO_INTERNACAO',
    ctx,
    itens: itensInput,
    itensIds: [],
    valorTotal,
  });
}
