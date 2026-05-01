/**
 * `POST /v1/cirurgias/{uuid}/confirmar` — AGENDADA → CONFIRMADA.
 *
 * Não aplica nenhuma regra extra: a confirmação é o ponto operacional
 * em que a equipe valida que tudo está pronto (paciente preparado, kit
 * separado, OPME autorizado se necessário). Validações específicas
 * vão acontecer no `iniciar` (RN-CC-05) ou em integrações futuras.
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
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class ConfirmarCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ConfirmarCirurgiaUseCase requires a request context.');
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    const novo = nextCirurgiaStatus(cir.status, 'confirmar');
    if (novo === null) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não pode ser confirmada.`,
      });
    }

    await this.repo.updateCirurgiaStatus(cir.id, 'CONFIRMADA');

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.confirmada',
        status_anterior: cir.status,
        status_novo: 'CONFIRMADA',
      },
      finalidade: 'cirurgia.confirmada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia confirmada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.confirmada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
