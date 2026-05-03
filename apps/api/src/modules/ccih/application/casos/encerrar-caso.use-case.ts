/**
 * `POST /v1/ccih/casos/{uuid}/encerrar` — encerra caso CCIH.
 *
 * Resultado obrigatório: CURA, OBITO ou ALTA_COM_INFECCAO. Status final
 * é sempre `ENCERRADO`.
 *
 * Emite evento `ccih.caso_encerrado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextCasoStatus, type CcihCasoStatus } from '../../domain/caso';
import type { EncerrarCasoCcihDto } from '../../dto/encerrar-caso.dto';
import type { CasoCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class EncerrarCasoUseCase {
  constructor(
    private readonly repo: CcihRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: EncerrarCasoCcihDto,
  ): Promise<CasoCcihResponse> {
    const caso = await this.repo.findCasoByUuid(uuid);
    if (caso === null) {
      throw new NotFoundException({
        code: 'CCIH_CASO_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    const target = nextCasoStatus(caso.status as CcihCasoStatus, 'encerrar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CCIH_TRANSICAO_INVALIDA',
        message: `Caso em status ${caso.status} não pode ser encerrado.`,
      });
    }

    await this.repo.updateEncerrarCaso({
      id: caso.id,
      resultado: dto.resultado,
      observacao: dto.observacao ?? null,
    });

    await this.auditoria.record({
      tabela: 'ccih_casos',
      registroId: caso.id,
      operacao: 'U',
      diff: {
        evento: 'ccih.caso_encerrado',
        status_anterior: caso.status,
        status_novo: target,
        resultado: dto.resultado,
      },
      finalidade: 'ccih.caso_encerrado',
    });

    this.events.emit('ccih.caso_encerrado', {
      casoUuid: caso.uuid_externo,
      resultado: dto.resultado,
    });

    const updated = await this.repo.findCasoByUuid(uuid);
    if (updated === null) {
      throw new Error('Caso CCIH pós-encerramento não encontrado (RLS?).');
    }
    return presentCaso(updated);
  }
}
