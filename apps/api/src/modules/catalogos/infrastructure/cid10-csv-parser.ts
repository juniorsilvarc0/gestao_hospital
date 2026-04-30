/**
 * Placeholder de parser CID-10 (DATASUS).
 *
 * O catálogo CID não vive em `tabelas_procedimentos` — é um catálogo
 * próprio (futura tabela `cid10`). Implementamos apenas o esqueleto
 * para que o endpoint genérico `/importar` possa aceitar `tipo=CID10`
 * já em produção, com job que apenas reporta "não implementado".
 *
 * Trilha futura: ler arquivo CID10.csv (DATASUS) e popular tabela
 * `cid10 (codigo, nome_curto, nome_longo, sexo, capitulo, grupo)`.
 */
import type { ParseError } from './tuss-csv-parser';

export interface Cid10Row {
  codigo: string;
  nome: string;
}

export interface Cid10ParseResult {
  rows: Cid10Row[];
  errors: ParseError[];
  totalLines: number;
}

export function parseCid10Csv(_content: string): Cid10ParseResult {
  return {
    rows: [],
    errors: [
      {
        line: 0,
        message:
          'Importador CID-10 ainda não implementado — placeholder. Trilha futura.',
      },
    ],
    totalLines: 0,
  };
}
