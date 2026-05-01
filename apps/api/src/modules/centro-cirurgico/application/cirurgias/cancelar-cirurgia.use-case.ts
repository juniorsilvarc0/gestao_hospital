/**
 * `POST /v1/cirurgias/{uuid}/cancelar` — RN-CC-07.
 *
 * Cancelamento permitido em AGENDADA / CONFIRMADA / EM_ANDAMENTO /
 * SUSPENSA. Exige `motivo` >= 10 chars (validado no DTO). Audita o
 * motivo + status anterior; status final = CANCELADA.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextCirurgiaStatus } from '../../domain/cirurgia';
import type { CancelarCirurgiaDto } from '../../dto/cancelar-cirurgia.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class CancelarCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: CancelarCirurgiaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CancelarCirurgiaUseCase requires a request context.');
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    const novo = nextCirurgiaStatus(cir.status, 'cancelar');
    if (novo === null) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não pode ser cancelada.`,
      });
    }

    await this.repo.updateCirurgiaCancelamento({
      cirurgiaId: cir.id,
      motivo: dto.motivo,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.cancelada',
        status_anterior: cir.status,
        status_novo: 'CANCELADA',
        motivo: dto.motivo,
      },
      finalidade: 'cirurgia.cancelada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia cancelada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.cancelada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
