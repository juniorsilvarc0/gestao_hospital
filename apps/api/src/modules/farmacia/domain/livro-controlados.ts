/**
 * Domínio — Livro de Controlados (Portaria 344/SVS-MS).
 *
 * Cada movimento (entrada/saída/ajuste/perda) atualiza o saldo do par
 * (procedimento, lote). A trigger `tg_livro_controlados_validate` no
 * Postgres garante a consistência do saldo (o saldo não pode ficar
 * negativo, e o saldo_atual deve bater com saldo_anterior ± quantidade).
 *
 * Aqui mantemos apenas tipos e o cálculo idêntico para que o use case
 * possa validar **antes** do INSERT (e devolver 422 estruturado em vez
 * de capturar a exceção do Postgres como 500).
 */

export const LIVRO_TIPOS_MOVIMENTO = [
  'ENTRADA',
  'SAIDA',
  'AJUSTE',
  'PERDA',
] as const;
export type LivroTipoMovimento = (typeof LIVRO_TIPOS_MOVIMENTO)[number];

export interface SaldoCalculo {
  saldoAnterior: string;
  saldoAtual: string;
  /**
   * `true` se a operação produziria saldo negativo. O caller deve
   * recusar o INSERT antes mesmo de chegar à trigger.
   */
  saldoNegativo: boolean;
}

/**
 * Calcula o saldo resultante de um movimento, retornando strings (para
 * preservar precisão fixa-decimal). `saldoAnteriorStr` e `quantidadeStr`
 * vêm tipicamente do Postgres como `NUMERIC` em formato textual.
 *
 * Para `AJUSTE` o caller informa explicitamente `saldoAtualStr` (porque
 * ajuste pode subir ou descer livremente — auditoria via JSONB explica).
 */
export function calcularSaldo(
  saldoAnteriorStr: string,
  quantidadeStr: string,
  tipo: LivroTipoMovimento,
  saldoAtualStr?: string,
): SaldoCalculo {
  const saldoAnterior = Number(saldoAnteriorStr);
  const quantidade = Number(quantidadeStr);
  if (!Number.isFinite(saldoAnterior) || !Number.isFinite(quantidade)) {
    throw new Error('saldo/quantidade inválidos');
  }

  let saldoAtual: number;
  switch (tipo) {
    case 'ENTRADA':
      saldoAtual = saldoAnterior + quantidade;
      break;
    case 'SAIDA':
    case 'PERDA':
      saldoAtual = saldoAnterior - quantidade;
      break;
    case 'AJUSTE':
      if (saldoAtualStr === undefined) {
        throw new Error('AJUSTE exige saldoAtualStr explícito.');
      }
      saldoAtual = Number(saldoAtualStr);
      if (!Number.isFinite(saldoAtual)) {
        throw new Error('saldoAtual inválido');
      }
      break;
    default:
      throw new Error(`tipo de movimento desconhecido: ${tipo as string}`);
  }

  // Mantém 6 casas (compat com DECIMAL(18,6) do schema).
  const saldoAtualFixed = saldoAtual.toFixed(6);
  return {
    saldoAnterior: saldoAnterior.toFixed(6),
    saldoAtual: saldoAtualFixed,
    saldoNegativo: saldoAtual < 0,
  };
}
