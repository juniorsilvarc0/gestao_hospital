/**
 * `POST /v1/repasse/{uuid}/cancelar` — qualquer não-CANCELADO → CANCELADO.
 *
 * RN-REP-04/05:
 *   - APURADO/CONFERIDO/LIBERADO podem cancelar livremente.
 *   - PAGO pode cancelar como estorno excepcional (auditável). A trigger
 *     `tg_repasse_imutavel` permite essa única transição saindo de PAGO.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  nextRepasseStatus,
  type RepasseStatus,
} from '../../domain/repasse-lifecycle';
import type { CancelarRepasseDto } from '../../dto/cancelar-repasse.dto';
import type { RepasseResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse } from './repasse.presenter';

@Injectable()
export class CancelarRepasseUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    repasseUuid: string,
    dto: CancelarRepasseDto,
  ): Promise<RepasseResponse> {
    const row = await this.repo.findRepasseByUuid(repasseUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'REPASSE_NOT_FOUND',
        message: 'Repasse não encontrado.',
      });
    }

    const target = nextRepasseStatus(row.status as RepasseStatus, 'cancelar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'REPASSE_TRANSICAO_INVALIDA',
        message: `Repasse em status ${row.status} não pode ser cancelado.`,
      });
    }

    await this.repo.updateRepasseCancelar({
      id: row.id,
      motivo: dto.motivo,
    });

    await this.auditoria.record({
      tabela: 'repasses',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'repasse.cancelado',
        status_anterior: row.status,
        status_novo: target,
        motivo: dto.motivo,
      },
      finalidade: 'repasse.cancelado',
    });

    const updated = await this.repo.findRepasseByUuid(repasseUuid);
    if (updated === null) {
      throw new Error('Repasse após cancelamento não encontrado (RLS?).');
    }
    return presentRepasse(updated);
  }
}
