/**
 * `POST /v1/tiss/lotes` — cria lote agrupando guias.
 *
 * Regras (RN-FAT-04):
 *   - Todas as guias devem ser do MESMO convênio (validado contra a
 *     `convenios.id` da conta).
 *   - Guias devem estar com `status='GERADA'` e ainda sem lote.
 *   - Versão TISS de todas as guias deve coincidir (não misturamos
 *     4.00.00 com 4.01.00 no mesmo lote).
 *   - Lote começa em `EM_PREPARACAO`, mas como já vamos vincular as
 *     guias, persistimos direto como `GERADO` (próximo passo é validar).
 *
 * `numeroLote` é calculado como `MAX(numero_lote)+1` — formato 4 dígitos
 * — quando o cliente não informa.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CriarLoteDto } from '../../dto/criar-lote.dto';
import type { LoteResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class CriarLoteUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: CriarLoteDto): Promise<LoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CriarLoteUseCase requires request context.');
    }

    const convenioId = await this.repo.findConvenioIdByUuid(dto.convenioUuid);
    if (convenioId === null) {
      throw new NotFoundException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    // Resolve cada guia individualmente para validar:
    //   1) existe
    //   2) está em status GERADA
    //   3) não está em outro lote
    //   4) pertence ao convênio do lote
    //   5) versao TISS bate com as outras
    const guias: {
      id: bigint;
      uuid: string;
      versaoTiss: string;
      valorTotal: string;
    }[] = [];

    let versaoTiss: string | null = null;
    let valorTotalAcc = 0;

    for (const guiaUuid of dto.guiaUuids) {
      const guia = await this.repo.findGuiaByUuid(guiaUuid);
      if (guia === null) {
        throw new NotFoundException({
          code: 'GUIA_NOT_FOUND',
          message: `Guia ${guiaUuid} não encontrada.`,
        });
      }
      if (guia.status !== 'GERADA') {
        throw new UnprocessableEntityException({
          code: 'GUIA_STATUS_INVALIDO',
          message: `Guia ${guiaUuid} não está GERADA (status=${guia.status}).`,
        });
      }
      if (guia.lote_id !== null) {
        throw new UnprocessableEntityException({
          code: 'GUIA_JA_EM_LOTE',
          message: `Guia ${guiaUuid} já pertence a outro lote (${guia.lote_uuid}).`,
        });
      }
      // Conta da guia precisa ser do mesmo convênio do lote.
      const conta = await this.repo.findContaByUuid(guia.conta_uuid);
      if (conta === null || conta.convenio_id !== convenioId) {
        throw new UnprocessableEntityException({
          code: 'CONVENIO_DIVERGENTE',
          message: `Guia ${guiaUuid} pertence a outro convênio.`,
        });
      }
      if (versaoTiss === null) {
        versaoTiss = guia.versao_tiss;
      } else if (versaoTiss !== guia.versao_tiss) {
        throw new UnprocessableEntityException({
          code: 'VERSAO_TISS_DIVERGENTE',
          message: `Guia ${guiaUuid} usa TISS ${guia.versao_tiss}, lote tem ${versaoTiss}.`,
        });
      }
      const v = Number(guia.valor_total);
      if (Number.isFinite(v)) valorTotalAcc += v;
      guias.push({
        id: guia.id,
        uuid: guia.uuid_externo,
        versaoTiss: guia.versao_tiss,
        valorTotal: guia.valor_total,
      });
    }

    if (guias.length === 0 || versaoTiss === null) {
      throw new UnprocessableEntityException({
        code: 'LOTE_SEM_GUIAS',
        message: 'O lote precisa ter ao menos uma guia.',
      });
    }

    const numeroLote =
      dto.numeroLote ??
      (await this.repo.getNextNumeroLote({
        tenantId: ctx.tenantId,
        convenioId,
        competencia: dto.competencia,
      }));

    const inserted = await this.repo.insertLote({
      tenantId: ctx.tenantId,
      convenioId,
      numeroLote,
      versaoTiss,
      competencia: dto.competencia,
      qtdGuias: guias.length,
      valorTotal: valorTotalAcc.toFixed(4),
      loteAnteriorId: null,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    // Vincula as guias ao lote.
    for (const g of guias) {
      await this.repo.attachGuiaToLote(g.id, inserted.id);
    }

    await this.auditoria.record({
      tabela: 'lotes_tiss',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'lote_tiss.criado',
        convenio_id: convenioId.toString(),
        numero_lote: numeroLote,
        competencia: dto.competencia,
        qtd_guias: guias.length,
        valor_total: valorTotalAcc.toFixed(4),
      },
      finalidade: 'tiss.lote.criado',
    });

    this.events.emit('tiss.lote.criado', {
      loteUuid: inserted.uuidExterno,
      convenioUuid: dto.convenioUuid,
      qtdGuias: guias.length,
    });

    const row = await this.repo.findLoteByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Lote criado não encontrado (RLS?).');
    }
    return presentLote(row);
  }
}
