/**
 * Use case: `POST /v1/lgpd/exports/{uuid}/rejeitar`.
 *
 * Permitido em qualquer status pré-APROVADO + APROVADO. Em terminais
 * (REJEITADO/EXPIRADO/BAIXADO/PRONTO_PARA_DOWNLOAD/GERANDO) retorna 422.
 * Motivo é obrigatório (validação no DTO).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { transition } from '../domain/export';
import type { RejeitarExportDto } from '../dto/rejeitar-export.dto';
import type { ExportResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

@Injectable()
export class RejeitarExportUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: RejeitarExportDto): Promise<ExportResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RejeitarExportUseCase requires a request context.');
    }

    const current = await this.repo.findExportByUuid(uuid);
    if (current === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }

    const result = transition(current.status, 'rejeitar');
    if (result.next === null) {
      throw new UnprocessableEntityException({
        code: 'TRANSICAO_INVALIDA',
        message:
          result.motivo ??
          `Não é possível rejeitar export em status ${current.status}.`,
      });
    }

    const affected = await this.repo.updateExportRejeitar(
      current.id,
      ctx.userId,
      dto.motivo,
    );
    if (affected === 0) {
      throw new UnprocessableEntityException({
        code: 'STATUS_ALTERADO_CONCORRENTEMENTE',
        message:
          'O status do export foi alterado por outro processo. Recarregue e tente novamente.',
      });
    }

    await this.auditoria.record({
      tabela: 'lgpd_exports',
      registroId: current.id,
      operacao: 'U',
      diff: {
        antes: { status: current.status },
        depois: { status: 'REJEITADO', motivoRejeicao: dto.motivo },
      },
      finalidade: 'lgpd.export.rejeitado',
    });

    const updated = await this.repo.findExportByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND' });
    }
    return presentExport(updated);
  }
}
