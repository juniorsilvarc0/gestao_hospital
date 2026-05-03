/**
 * `POST /v1/cme/lotes/{uuid}/liberar` — RN-CME-01.
 *
 * Só libera se `indicadorBiologicoOk = TRUE`. Se `FALSE`, retorna 422 e
 * orienta o operador a usar `/reprovar`. Status atual deve ser
 * `EM_PROCESSAMENTO` ou `AGUARDANDO_INDICADOR`.
 *
 * Emite evento `cme.lote_liberado` para integrações futuras.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  nextLoteStatus,
  validateLiberacao,
  type CmeLoteStatus,
} from '../../domain/lote';
import type { LiberarLoteDto } from '../../dto/liberar-lote.dto';
import type { LoteResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class LiberarLoteUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string, dto: LiberarLoteDto): Promise<LoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('LiberarLoteUseCase requires request context.');
    }

    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'CME_LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }

    // RN-CME-01: indicador biológico OK obrigatório.
    const erro = validateLiberacao(
      lote.status as CmeLoteStatus,
      dto.indicadorBiologicoOk,
    );
    if (erro !== null) {
      throw new UnprocessableEntityException({
        code: 'CME_LIBERACAO_INVALIDA',
        message: erro,
      });
    }

    const target = nextLoteStatus(lote.status as CmeLoteStatus, 'liberar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CME_LOTE_TRANSICAO_INVALIDA',
        message: `Lote em status ${lote.status} não pode ser liberado.`,
      });
    }

    await this.repo.updateLoteLiberar({
      id: lote.id,
      indicadorBiologicoOk: true,
      indicadorBiologicoUrl: dto.indicadorBiologicoUrl ?? null,
      indicadorQuimicoOk: dto.indicadorQuimicoOk,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'cme_lotes',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'cme.lote_liberado',
        numero: lote.numero,
        status_anterior: lote.status,
        status_novo: target,
        indicador_quimico_ok: dto.indicadorQuimicoOk,
      },
      finalidade: 'cme.lote_liberado',
    });

    this.events.emit('cme.lote_liberado', {
      loteUuid: lote.uuid_externo,
      numero: lote.numero,
      validade: lote.validade,
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote pós-liberação não encontrado (RLS?).');
    }
    return presentLote(updated);
  }
}
