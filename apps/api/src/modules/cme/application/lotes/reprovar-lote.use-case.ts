/**
 * `POST /v1/cme/lotes/{uuid}/reprovar` — RN-CME-03.
 *
 * Reprovar lote → todos os artigos não-descartados ganham movimentação
 * para `DESCARTADO` (a trigger DB atualiza `etapa_atual`).
 *
 * `responsavel_id` da movimentação cascateada = `responsavel_id` do
 * lote (operador que originalmente cadastrou). Garantimos rastreabilidade
 * do "porquê" via `motivo_reprovacao` no lote + auditoria.
 *
 * Emite evento `cme.lote_reprovado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextLoteStatus, type CmeLoteStatus } from '../../domain/lote';
import type { ReprovarLoteDto } from '../../dto/reprovar-lote.dto';
import type { LoteResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class ReprovarLoteUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string, dto: ReprovarLoteDto): Promise<LoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ReprovarLoteUseCase requires request context.');
    }

    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'CME_LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }

    const target = nextLoteStatus(lote.status as CmeLoteStatus, 'reprovar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CME_LOTE_TRANSICAO_INVALIDA',
        message: `Lote em status ${lote.status} não pode ser reprovado.`,
      });
    }

    await this.repo.updateLoteReprovar({
      id: lote.id,
      motivo: dto.motivo,
    });

    // RN-CME-03: cascade DESCARTADO em todos os artigos não-descartados.
    const artigos = await this.repo.findArtigosIdsByLoteId(lote.id);
    let artigosDescartados = 0;
    for (const a of artigos) {
      // Se já é DESCARTADO, pula (filtrado no repo, mas defensivo).
      if (a.etapaAtual === 'DESCARTADO') continue;
      await this.repo.insertMovimentacao({
        tenantId: ctx.tenantId,
        artigoId: a.artigoId,
        etapaOrigem: a.etapaAtual,
        etapaDestino: 'DESCARTADO',
        responsavelId: lote.responsavel_id,
        observacao: `Cascade: lote ${lote.numero} reprovado — ${dto.motivo}`,
      });
      artigosDescartados++;
    }

    await this.auditoria.record({
      tabela: 'cme_lotes',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'cme.lote_reprovado',
        numero: lote.numero,
        status_anterior: lote.status,
        status_novo: target,
        motivo: dto.motivo,
        artigos_descartados: artigosDescartados,
      },
      finalidade: 'cme.lote_reprovado',
    });

    this.events.emit('cme.lote_reprovado', {
      loteUuid: lote.uuid_externo,
      numero: lote.numero,
      motivo: dto.motivo,
      artigosDescartados,
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote pós-reprovação não encontrado (RLS?).');
    }
    return presentLote(updated);
  }
}
