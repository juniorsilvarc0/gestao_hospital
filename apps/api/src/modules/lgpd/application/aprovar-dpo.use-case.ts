/**
 * Use case: `POST /v1/lgpd/exports/{uuid}/aprovar-dpo` (RN-LGP-04).
 *
 * 1ª aprovação do dual-approval. Pré-condição: status =
 * AGUARDANDO_APROVACAO_DPO. UPDATE condicional no banco trata race
 * (se outro DPO aprovou simultaneamente, `affected = 0` → 422).
 *
 * Restrição: o supervisor que vier a aprovar depois NÃO pode ser o
 * mesmo usuário (CHECK constraint `ck_lgpd_export_aprovadores_distintos`
 * — falha capturada no use case `aprovar-supervisor`).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { transition } from '../domain/export';
import type { ExportResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';
import { presentExport } from './export.presenter';

@Injectable()
export class AprovarDpoUseCase {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<ExportResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AprovarDpoUseCase requires a request context.');
    }

    const current = await this.repo.findExportByUuid(uuid);
    if (current === null) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export LGPD não encontrado.',
      });
    }

    const result = transition(current.status, 'aprovar_dpo');
    if (result.next === null) {
      throw new UnprocessableEntityException({
        code: 'TRANSICAO_INVALIDA',
        message:
          result.motivo ??
          `Transição inválida a partir do status ${current.status}.`,
      });
    }

    const affected = await this.repo.updateExportAprovarDpo(
      current.id,
      ctx.userId,
    );
    if (affected === 0) {
      // Race: alguém moveu o export entre o SELECT e o UPDATE.
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
        antes: { status: 'AGUARDANDO_APROVACAO_DPO' },
        depois: { status: 'AGUARDANDO_APROVACAO_SUPERVISOR' },
      },
      finalidade: 'lgpd.export.aprovado_dpo',
    });

    const updated = await this.repo.findExportByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND' });
    }
    return presentExport(updated);
  }
}
