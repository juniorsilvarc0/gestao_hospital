/**
 * `POST /v1/bi/export?formato=csv` — gera CSV (UTF-8 + BOM, separador
 * `;`, CRLF) de uma view permitida.
 *
 * Convenção:
 *   - Excel-friendly: BOM `﻿` no início para Excel ler UTF-8.
 *   - Separador `;` (padrão BR — Excel pt-BR usa).
 *   - Quebra de linha CRLF (RFC 4180).
 *   - Escape: aspas duplas com aspas duplas dobradas (`"a""b"`).
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { ExportBodyDto, ExportFiltrosDto } from '../dto/export.dto';
import { resolveFiltros } from './resolve-filtros';
import {
  ALLOWED_VIEWS,
  filterAllowedColumns,
  isAllowedView,
} from './views-allowlist';

export interface ExportCsvResult {
  filename: string;
  contentType: string;
  body: Buffer;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Escape se contém separador, quebra de linha ou aspas
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

@Injectable()
export class ExportCsvUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(args: {
    viewName: string;
    body: ExportBodyDto;
  }): Promise<ExportCsvResult> {
    if (!isAllowedView(args.viewName)) {
      throw new BadRequestException(
        `View '${args.viewName}' não está na allowlist de export.`,
      );
    }
    const view = ALLOWED_VIEWS[args.viewName];
    const colunas = filterAllowedColumns(view, args.body.colunas);
    if (colunas.length === 0) {
      throw new BadRequestException(
        'Nenhuma coluna válida foi requisitada para export.',
      );
    }

    // Resolução UUID → ID. Se algum UUID não resolveu (entidade
    // inexistente / outro tenant), devolvemos CSV vazio (header only).
    const filtros = await resolveFiltros(
      this.repo,
      args.body.filtros as ExportFiltrosDto,
    );

    const rows = filtros.unresolved
      ? []
      : await this.repo.exportarMv({
          viewName: args.viewName,
          colunas: [...colunas],
          filtros: {
            competenciaInicio: filtros.competenciaInicio,
            competenciaFim: filtros.competenciaFim,
            competencia: filtros.competencia,
            dataInicio: filtros.dataInicio,
            dataFim: filtros.dataFim,
            convenioId: filtros.convenioId,
            prestadorId: filtros.prestadorId,
            recursoId: filtros.recursoId,
            salaId: filtros.salaId,
            setorId: filtros.setorId,
            status: filtros.status,
          },
        });

    // Monta CSV.
    const header = colunas.map(escapeCsvCell).join(';');
    const lines = rows.map((row) =>
      colunas.map((c) => escapeCsvCell(row[c])).join(';'),
    );
    const body = `﻿${header}\r\n${lines.join('\r\n')}${
      lines.length > 0 ? '\r\n' : ''
    }`;

    return {
      filename: `${args.viewName}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from(body, 'utf8'),
    };
  }
}
