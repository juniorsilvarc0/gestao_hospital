/**
 * `POST /v1/ccih/casos/{uuid}/notificar` — RN-CCI-03.
 *
 * Marca `notificacao_compulsoria=TRUE` + `data_notificacao=now()`.
 * Operacionalmente também transita o caso para `NOTIFICADO` (a equipe
 * pode mover de volta para `EM_TRATAMENTO` se precisar continuar
 * acompanhando).
 *
 * O envio efetivo ao SINAN/GAL fica fora do escopo (Fase 13).
 *
 * Emite evento `ccih.caso_notificado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextCasoStatus, type CcihCasoStatus } from '../../domain/caso';
import { findCompulsoriaByCid } from '../../domain/doencas-compulsorias';
import type { CasoCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class NotificarCasoUseCase {
  constructor(
    private readonly repo: CcihRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string): Promise<CasoCcihResponse> {
    const caso = await this.repo.findCasoByUuid(uuid);
    if (caso === null) {
      throw new NotFoundException({
        code: 'CCIH_CASO_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    const target = nextCasoStatus(caso.status as CcihCasoStatus, 'notificar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CCIH_TRANSICAO_INVALIDA',
        message: `Caso em status ${caso.status} não pode ser notificado.`,
      });
    }

    if (caso.notificacao_compulsoria) {
      throw new UnprocessableEntityException({
        code: 'CCIH_JA_NOTIFICADO',
        message: 'Caso já está marcado como notificado.',
      });
    }

    await this.repo.updateNotificarCaso({ id: caso.id, status: target });

    const compulsoria = findCompulsoriaByCid(caso.cid);

    await this.auditoria.record({
      tabela: 'ccih_casos',
      registroId: caso.id,
      operacao: 'U',
      diff: {
        evento: 'ccih.caso_notificado',
        cid: caso.cid,
        cid_match_compulsoria: compulsoria?.cid ?? null,
        status_anterior: caso.status,
        status_novo: target,
      },
      finalidade: 'ccih.caso_notificado',
    });

    this.events.emit('ccih.caso_notificado', {
      casoUuid: caso.uuid_externo,
      cid: caso.cid,
      compulsoria: compulsoria?.cid ?? null,
    });

    const updated = await this.repo.findCasoByUuid(uuid);
    if (updated === null) {
      throw new Error('Caso CCIH pós-notificação não encontrado (RLS?).');
    }
    return presentCaso(updated);
  }
}
