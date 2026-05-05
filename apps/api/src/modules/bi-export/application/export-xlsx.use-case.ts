/**
 * `POST /v1/bi/export?formato=xlsx` — gera XLSX (Excel) de uma view
 * permitida usando `exceljs`.
 *
 * Estrutura: 1 sheet por view. Headers em bold. Auto-fit aproximado por
 * heurística simples (não custoso). Limite imposto pelo repo (100k rows).
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { BiRepository } from '../../bi/infrastructure/bi.repository';
import type { ExportBodyDto, ExportFiltrosDto } from '../dto/export.dto';
import { resolveFiltros } from './resolve-filtros';
import {
  ALLOWED_VIEWS,
  filterAllowedColumns,
  isAllowedView,
} from './views-allowlist';

export interface ExportXlsxResult {
  filename: string;
  contentType: string;
  body: Buffer;
}

@Injectable()
export class ExportXlsxUseCase {
  constructor(private readonly repo: BiRepository) {}

  async execute(args: {
    viewName: string;
    body: ExportBodyDto;
  }): Promise<ExportXlsxResult> {
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HMS-BR';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(args.viewName.slice(0, 31));

    sheet.columns = colunas.map((c) => ({
      header: c,
      key: c,
      width: Math.max(12, Math.min(40, c.length + 2)),
    }));
    // Header em bold.
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    for (const row of rows) {
      const obj: Record<string, unknown> = {};
      for (const c of colunas) {
        const v = row[c];
        obj[c] = v === null || v === undefined ? '' : v;
      }
      sheet.addRow(obj);
    }

    const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer | Buffer;
    const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);

    return {
      filename: `${args.viewName}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
    };
  }
}
