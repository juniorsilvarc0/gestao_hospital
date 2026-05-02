/**
 * `POST /v1/repasse/{uuid}/conferir` — APURADO → CONFERIDO.
 *
 * Grava `data_conferencia=now()` e `conferido_por=ctx.userId`.
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
import type { ConferirRepasseDto } from '../../dto/conferir.dto';
import type { RepasseResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse } from './repasse.presenter';

@Injectable()
export class ConferirRepasseUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    repasseUuid: string,
    dto: ConferirRepasseDto,
  ): Promise<RepasseResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'ConferirRepasseUseCase chamado fora do contexto de request.',
      );
    }

    const row = await this.repo.findRepasseByUuid(repasseUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'REPASSE_NOT_FOUND',
        message: 'Repasse não encontrado.',
      });
    }

    const target = nextRepasseStatus(row.status as RepasseStatus, 'conferir');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'REPASSE_TRANSICAO_INVALIDA',
        message: `Repasse em status ${row.status} não pode ser conferido.`,
      });
    }

    await this.repo.updateRepasseConferir({
      id: row.id,
      userId: ctx.userId,
      observacao: dto.observacao ?? null,
    });

    await this.auditoria.record({
      tabela: 'repasses',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'repasse.conferido',
        status_anterior: row.status,
        status_novo: target,
      },
      finalidade: 'repasse.conferido',
    });

    const updated = await this.repo.findRepasseByUuid(repasseUuid);
    if (updated === null) {
      throw new Error('Repasse após conferência não encontrado (RLS?).');
    }
    return presentRepasse(updated);
  }
}
