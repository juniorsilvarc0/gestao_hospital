/**
 * `POST /v1/tiss/lotes/{uuid}/reenviar` — cria um novo lote vinculado
 * ao anterior via `lote_anterior_id`.
 *
 * Por que não reabrir o lote original? RN-FAT-04 — lotes ENVIADO/
 * PROCESSADO são imutáveis (trigger `tg_lote_tiss_imutavel`). Reenvio
 * gera novo lote, mantendo a trilha do anterior para auditoria/contesta-
 * ção.
 *
 * As guias do lote anterior são copiadas — na prática, vinculadas ao
 * novo lote (uma guia só pode estar em um lote por vez). O cliente
 * pode opcionalmente fornecer `guiaUuids` para alterar a composição.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { LoteResponse } from '../../dto/responses';
import type { ReenviarLoteDto } from '../../dto/reenviar-lote.dto';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class ReenviarLoteUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: ReenviarLoteDto,
  ): Promise<LoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ReenviarLoteUseCase requires request context.');
    }

    const anterior = await this.repo.findLoteAnteriorByUuid(uuid);
    if (anterior === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote anterior não encontrado.',
      });
    }
    if (anterior.status !== 'ENVIADO' && anterior.status !== 'PROCESSADO') {
      throw new UnprocessableEntityException({
        code: 'LOTE_ANTERIOR_INVALIDO',
        message: `Apenas lotes ENVIADO/PROCESSADO podem ser reenviados (atual: ${anterior.status}).`,
      });
    }

    // Resolve guias a usar:
    //   - se cliente forneceu uuids → usa esses (revalida).
    //   - senão → copia as guias do lote anterior.
    let guiasIds: bigint[] = [];
    let valorTotalAcc = 0;

    if (dto.guiaUuids !== undefined && dto.guiaUuids.length > 0) {
      for (const u of dto.guiaUuids) {
        const g = await this.repo.findGuiaByUuid(u);
        if (g === null) {
          throw new NotFoundException({
            code: 'GUIA_NOT_FOUND',
            message: `Guia ${u} não encontrada.`,
          });
        }
        if (g.versao_tiss !== anterior.versaoTiss) {
          throw new UnprocessableEntityException({
            code: 'VERSAO_TISS_DIVERGENTE',
            message: `Guia ${u} usa TISS ${g.versao_tiss}, lote anterior usa ${anterior.versaoTiss}.`,
          });
        }
        const conta = await this.repo.findContaByUuid(g.conta_uuid);
        if (conta === null || conta.convenio_id !== anterior.convenioId) {
          throw new UnprocessableEntityException({
            code: 'CONVENIO_DIVERGENTE',
            message: `Guia ${u} pertence a outro convênio.`,
          });
        }
        guiasIds.push(g.id);
        valorTotalAcc += Number(g.valor_total);
      }
    } else {
      const guiasAntigas = await this.repo.findGuiasByLote(anterior.id);
      guiasIds = guiasAntigas.map((g) => g.id);
      valorTotalAcc = guiasAntigas.reduce(
        (acc, g) => acc + Number(g.valor_total),
        0,
      );
    }

    if (guiasIds.length === 0) {
      throw new UnprocessableEntityException({
        code: 'LOTE_SEM_GUIAS',
        message: 'O reenvio precisa ter ao menos uma guia.',
      });
    }

    const numeroLote = await this.repo.getNextNumeroLote({
      tenantId: ctx.tenantId,
      convenioId: anterior.convenioId,
      competencia: anterior.competencia,
    });

    const inserted = await this.repo.insertLote({
      tenantId: ctx.tenantId,
      convenioId: anterior.convenioId,
      numeroLote,
      versaoTiss: anterior.versaoTiss,
      competencia: anterior.competencia,
      qtdGuias: guiasIds.length,
      valorTotal: valorTotalAcc.toFixed(4),
      loteAnteriorId: anterior.id,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    // Vincula as guias ao novo lote (move-as do antigo se necessário).
    for (const id of guiasIds) {
      await this.repo.attachGuiaToLote(id, inserted.id);
    }

    await this.auditoria.record({
      tabela: 'lotes_tiss',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'lote_tiss.reenviado',
        lote_anterior_id: anterior.id.toString(),
        numero_lote: numeroLote,
        qtd_guias: guiasIds.length,
        valor_total: valorTotalAcc.toFixed(4),
      },
      finalidade: 'tiss.lote.reenviado',
    });

    this.events.emit('tiss.lote.reenviado', {
      novoLoteUuid: inserted.uuidExterno,
      loteAnteriorUuid: uuid,
    });

    const row = await this.repo.findLoteByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Novo lote não encontrado.');
    }
    return presentLote(row);
  }
}
