/**
 * Parser do CSV padrão TUSS (ANS).
 *
 * Formato esperado (semicolon-delimitado, UTF-8, com cabeçalho):
 *
 *   codigo;nome;tipo;grupo_gasto;tabela_tiss;unidade_medida;valor_referencia
 *
 * Notas:
 *   - O CSV oficial da ANS muda esporadicamente — este parser lida
 *     apenas com a fixture canônica (`apps/api/src/modules/catalogos/__fixtures__/tuss-mini.csv`)
 *     e com qualquer arquivo que respeite o cabeçalho acima.
 *   - Linhas com erro de parsing são ignoradas e devolvidas em
 *     `errors[]` para que o worker possa registrá-las em
 *     `import_jobs.error_log`.
 *   - Não consulta o banco — é função pura que recebe `string` e
 *     devolve registros estruturados.
 */
import { parse } from 'csv-parse/sync';

import { GRUPO_GASTOS, PROCEDIMENTO_TIPOS } from '../dto/list-procedimentos.dto';
import type { ProcedimentoUpsertInput } from '../application/procedimentos/upsert-procedimento-bulk.use-case';

export interface ParseError {
  line: number;
  field?: string;
  message: string;
}

export interface ParseResult {
  rows: ProcedimentoUpsertInput[];
  errors: ParseError[];
  totalLines: number;
}

const TIPOS = new Set<string>(PROCEDIMENTO_TIPOS);
const GRUPOS = new Set<string>(GRUPO_GASTOS);

const REQUIRED_HEADERS = ['codigo', 'nome', 'tipo', 'grupo_gasto'] as const;

interface CsvRecord {
  codigo?: string;
  nome?: string;
  tipo?: string;
  grupo_gasto?: string;
  tabela_tiss?: string;
  unidade_medida?: string;
  valor_referencia?: string;
}

export function parseTussCsv(content: string): ParseResult {
  const rows: ProcedimentoUpsertInput[] = [];
  const errors: ParseError[] = [];

  let records: CsvRecord[];
  try {
    records = parse(content, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      delimiter: [';', ','],
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      bom: true,
    }) as CsvRecord[];
  } catch (err) {
    return {
      rows,
      errors: [
        {
          line: 0,
          message: `Falha de parsing CSV: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      totalLines: 0,
    };
  }

  if (records.length === 0) {
    return { rows, errors: [{ line: 0, message: 'CSV vazio.' }], totalLines: 0 };
  }

  const headerKeys = Object.keys(records[0] as object);
  for (const required of REQUIRED_HEADERS) {
    if (!headerKeys.includes(required)) {
      errors.push({
        line: 1,
        message: `Cabeçalho obrigatório ausente: "${required}". Esperado: codigo;nome;tipo;grupo_gasto;...`,
      });
    }
  }
  if (errors.length > 0) {
    return { rows, errors, totalLines: records.length };
  }

  records.forEach((rec, idx) => {
    const lineNumber = idx + 2; // header + offset 1-based
    const codigo = (rec.codigo ?? '').trim();
    const nome = (rec.nome ?? '').trim();
    const tipo = (rec.tipo ?? '').trim().toUpperCase();
    const grupoGasto = (rec.grupo_gasto ?? '').trim().toUpperCase();

    if (codigo === '') {
      errors.push({ line: lineNumber, field: 'codigo', message: 'codigo vazio' });
      return;
    }
    if (!/^[0-9]{1,20}$/.test(codigo)) {
      errors.push({
        line: lineNumber,
        field: 'codigo',
        message: `codigo inválido: "${codigo}"`,
      });
      return;
    }
    if (nome.length < 2) {
      errors.push({
        line: lineNumber,
        field: 'nome',
        message: 'nome inválido (mín. 2 chars)',
      });
      return;
    }
    if (!TIPOS.has(tipo)) {
      errors.push({
        line: lineNumber,
        field: 'tipo',
        message: `tipo inválido: "${tipo}". Valores: ${[...TIPOS].join(', ')}`,
      });
      return;
    }
    if (!GRUPOS.has(grupoGasto)) {
      errors.push({
        line: lineNumber,
        field: 'grupo_gasto',
        message: `grupo_gasto inválido: "${grupoGasto}".`,
      });
      return;
    }

    const tabelaTiss =
      rec.tabela_tiss !== undefined && rec.tabela_tiss.trim() !== ''
        ? rec.tabela_tiss.trim()
        : '22'; // 22 = TUSS
    const unidadeMedida =
      rec.unidade_medida !== undefined && rec.unidade_medida.trim() !== ''
        ? rec.unidade_medida.trim()
        : null;

    let valorReferencia: number | null = null;
    if (rec.valor_referencia !== undefined && rec.valor_referencia.trim() !== '') {
      const parsedValor = Number(rec.valor_referencia.replace(',', '.'));
      if (Number.isNaN(parsedValor) || parsedValor < 0) {
        errors.push({
          line: lineNumber,
          field: 'valor_referencia',
          message: `valor_referencia inválido: "${rec.valor_referencia}"`,
        });
        return;
      }
      valorReferencia = parsedValor;
    }

    rows.push({
      codigoTuss: codigo,
      nome,
      tipo,
      grupoGasto,
      tabelaTiss,
      unidadeMedida,
      valorReferencia,
    });
  });

  return { rows, errors, totalLines: records.length };
}
