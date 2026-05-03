/**
 * `POST /v1/cme/lotes/{uuid}/marcar-expirado` — RN-CME-04.
 *
 * Endpoint manual usado pelo job batch (futuro) para marcar lotes com
 * `validade < CURRENT_DATE` como EXPIRADO. Só vale para lotes LIBERADO.
 *
 * Emite evento `cme.lote_expirado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextLoteStatus, type CmeLoteStatus } from '../../domain/lote';
import type { LoteResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class MarcarLoteExpiradoUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string): Promise<LoteResponse> {
    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'CME_LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }

    const target = nextLoteStatus(
      lote.status as CmeLoteStatus,
      'marcar_expirado',
    );
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CME_LOTE_TRANSICAO_INVALIDA',
        message: `Lote em status ${lote.status} não pode ser marcado como EXPIRADO.`,
      });
    }

    await this.repo.updateLoteMarcarExpirado(lote.id);

    await this.auditoria.record({
      tabela: 'cme_lotes',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'cme.lote_expirado',
        numero: lote.numero,
        validade: lote.validade.toISOString(),
        status_anterior: lote.status,
        status_novo: target,
      },
      finalidade: 'cme.lote_expirado',
    });

    this.events.emit('cme.lote_expirado', {
      loteUuid: lote.uuid_externo,
      numero: lote.numero,
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote pós-expiração não encontrado (RLS?).');
    }
    return presentLote(updated);
  }
}
