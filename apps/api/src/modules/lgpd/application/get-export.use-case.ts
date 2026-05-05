/**
 * Use case: `GET /v1/lgpd/exports/{uuid}`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { ExportResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

@Injectable()
export class GetExportUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(uuid: string): Promise<ExportResponse> {
    const row = await this.repo.findExportByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }
    return presentExport(row);
  }
}
