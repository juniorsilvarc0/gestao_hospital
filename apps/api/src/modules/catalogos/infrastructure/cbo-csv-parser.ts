/**
 * Placeholder de parser CBO 2002 (Ministério do Trabalho).
 *
 * CBO popula a tabela `especialidades` (codigo_cbos). Implementação
 * real virá quando a Trilha B precisar carregar especialidades em
 * massa — hoje a Trilha B faz CRUD manual.
 */
import type { ParseError } from './tuss-csv-parser';

export interface CboRow {
  codigoCbo: string;
  nome: string;
}

export interface CboParseResult {
  rows: CboRow[];
  errors: ParseError[];
  totalLines: number;
}

export function parseCboCsv(_content: string): CboParseResult {
  return {
    rows: [],
    errors: [
      {
        line: 0,
        message:
          'Importador CBO ainda não implementado — placeholder. Trilha futura.',
      },
    ],
    totalLines: 0,
  };
}
