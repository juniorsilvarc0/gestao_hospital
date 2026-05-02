/**
 * Contexto compartilhado entre os builders por tipo de guia.
 *
 * Cada builder recebe um `BuilderContext` (snapshot da conta + itens
 * compatíveis) e devolve um `BuilderResult` com:
 *   - `xml`: string UTF-8 com prólogo
 *   - `hashXml`: SHA-256 do XML
 *   - `valorTotal`: decimal-as-string (4 casas)
 *   - `validacao`: resultado da validação estrutural (CLAUDE.md §7)
 *   - `itensIds`: ids dos `contas_itens` que entraram na guia (o use
 *     case faz o `UPDATE contas_itens SET guia_tiss_id` depois)
 *
 * Os builders NÃO persistem nada — só geram XML em memória. Isso
 * garante que o use case possa rodar a validação ANTES do INSERT
 * (CLAUDE.md §7 #1).
 */
import type {
  ContaItemForGuiaRow,
  ContaSnapshotRow,
} from '../../../infrastructure/tiss.repository';
import type {
  GuiaTissTipo,
  ValidacaoXsdStatus,
} from '../../../domain/guia-tiss';
import type { ValidacaoErro } from '../../../domain/tiss-validator';

export interface BuilderContext {
  conta: ContaSnapshotRow;
  itens: ContaItemForGuiaRow[];
  /** Versão TISS efetiva (snapshot da conta ou fallback do convênio). */
  versaoTiss: string;
  /** Número da guia do prestador — gerado pelo use case. */
  numeroGuiaPrestador: string;
}

export interface BuilderResult {
  tipo: GuiaTissTipo;
  xml: string;
  hashXml: string;
  valorTotal: string; // 4 casas decimais
  validacaoStatus: ValidacaoXsdStatus;
  validacaoErros: ValidacaoErro[] | null;
  itensIds: bigint[];
}

/** Soma `valor_total` (string) de uma lista de itens, devolvendo string. */
export function somarItens(itens: ContaItemForGuiaRow[]): string {
  let acc = 0;
  for (const it of itens) {
    const n = Number(it.valor_total);
    if (Number.isFinite(n)) {
      acc += n;
    }
  }
  return acc.toFixed(4);
}

/**
 * Converte itens de `contas_itens` para a estrutura usada pelo
 * `tiss-validator` e pelo `xml-builder`. Mantemos `valor_total` como
 * string para evitar perda de precisão.
 */
export function itensToValidatorInput(
  itens: ContaItemForGuiaRow[],
): {
  codigo: string | null;
  codigoTabela: string | null;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
}[] {
  return itens.map((it) => ({
    codigo: it.procedimento_codigo_tuss,
    codigoTabela: it.tabela_tiss_origem ?? it.procedimento_tabela ?? null,
    quantidade: it.quantidade,
    valorUnitario: it.valor_unitario,
    valorTotal: it.valor_total,
  }));
}

/**
 * Converte a data de saída do atendimento (se houver) para `YYYY-MM-DD`.
 */
export function isoDate(d: Date | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
