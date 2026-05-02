/**
 * `POST /v1/repasse/{uuid}/liberar` — CONFERIDO → LIBERADO.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  nextRepasseStatus,
  type RepasseStatus,
} from '../../domain/repasse-lifecycle';
import type { LiberarRepasseDto } from '../../dto/liberar.dto';
import type { RepasseResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse } from './repasse.presenter';

@Injectable()
export class LiberarRepasseUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    repasseUuid: string,
    dto: LiberarRepasseDto,
  ): Promise<RepasseResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'LiberarRepasseUseCase chamado fora do contexto de request.',
      );
    }

    const row = await this.repo.findRepasseByUuid(repasseUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'REPASSE_NOT_FOUND',
        message: 'Repasse não encontrado.',
      });
    }

    const target = nextRepasseStatus(row.status as RepasseStatus, 'liberar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'REPASSE_TRANSICAO_INVALIDA',
        message: `Repasse em status ${row.status} não pode ser liberado.`,
      });
    }

    await this.repo.updateRepasseLiberar({
      id: row.id,
      userId: ctx.userId,
      observacao: dto.observacao ?? null,
    });

    await this.auditoria.record({
      tabela: 'repasses',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'repasse.liberado',
        status_anterior: row.status,
        status_novo: target,
      },
      finalidade: 'repasse.liberado',
    });

    const updated = await this.repo.findRepasseByUuid(repasseUuid);
    if (updated === null) {
      throw new Error('Repasse após liberação não encontrado (RLS?).');
    }
    return presentRepasse(updated);
  }
}
