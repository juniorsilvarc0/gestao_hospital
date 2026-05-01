/**
 * `POST /v1/dispensacoes/{uuid}/separar` — operador na bancada confirma
 * que separou os itens, opcionalmente atualizando lote/validade reais
 * ao escanear códigos de barras.
 *
 * Transição: PENDENTE → SEPARADA (cabeçalho + itens).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextStatus } from '../../domain/dispensacao';
import type { SepararDispensacaoDto } from '../../dto/separar.dto';
import type { DispensacaoResponse } from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentDispensacao } from './dispensacao.presenter';

@Injectable()
export class SepararDispensacaoUseCase {
  constructor(
    private readonly repo: FarmaciaRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: SepararDispensacaoDto,
  ): Promise<DispensacaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('SepararDispensacaoUseCase requires a request context.');
    }

    const disp = await this.repo.findDispensacaoByUuid(uuid);
    if (disp === null) {
      throw new NotFoundException({
        code: 'DISPENSACAO_NOT_FOUND',
        message: 'Dispensação não encontrada.',
      });
    }
    const novo = nextStatus(disp.status, 'separar');
    if (novo === null) {
      throw new ConflictException({
        code: 'DISPENSACAO_STATUS_INVALIDO',
        message: `Dispensação no status ${disp.status} não pode ser separada.`,
      });
    }

    const itens = await this.repo.findItensByDispensacaoId(
      disp.id,
      disp.data_hora,
    );
    const itemUuidToId = new Map(itens.map((i) => [i.uuid_externo, i.id]));

    // Atualiza lote/validade dos itens citados.
    for (const it of dto.itens) {
      const id = itemUuidToId.get(it.itemUuid);
      if (id === undefined) {
        throw new NotFoundException({
          code: 'DISPENSACAO_ITEM_NOT_FOUND',
          message: `Item ${it.itemUuid} não pertence à dispensação.`,
        });
      }
      await this.repo.updateDispensacaoItemSeparacao(
        id,
        it.lote ?? null,
        it.validade ?? null,
      );
    }
    // Itens não citados também viram SEPARADA (ato em massa).
    for (const it of itens) {
      if (!dto.itens.some((di) => di.itemUuid === it.uuid_externo)) {
        await this.repo.updateDispensacaoItemStatus(it.id, 'SEPARADA');
      }
    }

    await this.repo.updateDispensacaoStatus(disp.id, disp.data_hora, 'SEPARADA');

    await this.auditoria.record({
      tabela: 'dispensacoes',
      registroId: disp.id,
      operacao: 'U',
      diff: {
        evento: 'dispensacao.separada',
        status_anterior: disp.status,
        status_novo: 'SEPARADA',
        n_itens_atualizados: dto.itens.length,
      },
      finalidade: 'dispensacao.separada',
    });

    const updated = await this.repo.findDispensacaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Dispensação separada não encontrada (RLS?).');
    }
    const updatedItens = await this.repo.findItensByDispensacaoId(
      disp.id,
      disp.data_hora,
    );
    const presented = presentDispensacao(updated, updatedItens);

    this.events.emit('dispensacao.separada', {
      tenantId: ctx.tenantId.toString(),
      dispensacao: presented,
    });

    return presented;
  }
}
