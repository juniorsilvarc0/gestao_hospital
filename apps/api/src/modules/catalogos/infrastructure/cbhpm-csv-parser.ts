/**
 * Parser do CSV padrão CBHPM (AMB).
 *
 * Cabeçalho esperado:
 *   codigo_cbhpm;codigo_tuss;nome;porte;custo_operacional;tipo;grupo_gasto;valor_referencia
 *
 * `codigo_tuss` é a chave canônica (já que TUSS unifica catálogos no
 * Brasil); `codigo_cbhpm` entra como atributo. Linha sem `codigo_tuss`
 * é ignorada (não há como upsertar).
 */
import { parse } from 'csv-parse/sync';

import { GRUPO_GASTOS, PROCEDIMENTO_TIPOS } from '../dto/list-procedimentos.dto';
import type { ParseError, ParseResult } from './tuss-csv-parser';
import type { ProcedimentoUpsertInput } from '../application/procedimentos/upsert-procedimento-bulk.use-case';

const TIPOS = new Set<string>(PROCEDIMENTO_TIPOS);
const GRUPOS = new Set<string>(GRUPO_GASTOS);

interface CsvRecord {
  codigo_cbhpm?: string;
  codigo_tuss?: string;
  nome?: string;
  porte?: string;
  custo_operacional?: string;
  tipo?: string;
  grupo_gasto?: string;
  valor_referencia?: string;
}

export function parseCbhpmCsv(content: string): ParseResult {
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

  records.forEach((rec, idx) => {
    const lineNumber = idx + 2;
    const codigoTuss = (rec.codigo_tuss ?? '').trim();
    const codigoCbhpm = (rec.codigo_cbhpm ?? '').trim();
    const nome = (rec.nome ?? '').trim();
    const tipo = (rec.tipo ?? 'PROCEDIMENTO').trim().toUpperCase();
    const grupoGasto = (rec.grupo_gasto ?? 'PROCEDIMENTO').trim().toUpperCase();

    if (codigoTuss === '') {
      errors.push({
        line: lineNumber,
        field: 'codigo_tuss',
        message: 'codigo_tuss obrigatório (chave única do catálogo)',
      });
      return;
    }
    if (!/^[0-9]{1,20}$/.test(codigoTuss)) {
      errors.push({
        line: lineNumber,
        field: 'codigo_tuss',
        message: `codigo_tuss inválido: "${codigoTuss}"`,
      });
      return;
    }
    if (nome.length < 2) {
      errors.push({
        line: lineNumber,
        field: 'nome',
        message: 'nome inválido',
      });
      return;
    }
    if (!TIPOS.has(tipo)) {
      errors.push({
        line: lineNumber,
        field: 'tipo',
        message: `tipo inválido: "${tipo}"`,
      });
      return;
    }
    if (!GRUPOS.has(grupoGasto)) {
      errors.push({
        line: lineNumber,
        field: 'grupo_gasto',
        message: `grupo_gasto inválido: "${grupoGasto}"`,
      });
      return;
    }

    const porte =
      rec.porte !== undefined && rec.porte.trim() !== ''
        ? rec.porte.trim()
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
      codigoTuss,
      codigoCbhpm: codigoCbhpm !== '' ? codigoCbhpm : null,
      nome,
      tipo,
      grupoGasto,
      tabelaTiss: '22', // TUSS, mesmo para itens originados em CBHPM
      porte,
      valorReferencia,
    });
  });

  return { rows, errors, totalLines: records.length };
}
