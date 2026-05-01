/**
 * `POST /v1/cirurgias/{uuid}/opme/autorizar` — fase 2 do fluxo OPME
 * (RN-CC-03).
 *
 * Grava `opme_autorizada` + carimbo (`opme_autorizacao_em`,
 * `opme_autorizacao_por = userId`).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { OpmeAutorizarDto } from '../../dto/opme.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from '../cirurgias/cirurgia.presenter';

const STATUSES_PERMITIDOS = new Set([
  'AGENDADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
]);

@Injectable()
export class AutorizarOpmeUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: OpmeAutorizarDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AutorizarOpmeUseCase requires a request context.');
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    if (!STATUSES_PERMITIDOS.has(cir.status)) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não aceita autorização OPME.`,
      });
    }

    const itens = dto.itens.map((it) => ({
      procedimentoUuid: it.procedimentoUuid ?? null,
      descricao: it.descricao,
      quantidade: it.quantidade,
      fabricante: it.fabricante ?? null,
      registroAnvisa: it.registroAnvisa ?? null,
      lote: it.lote ?? null,
      motivoUrgencia: null,
    }));

    await this.repo.updateOpme({
      cirurgiaId: cir.id,
      fase: 'autorizada',
      itens,
      autorizadaPorUserId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.opme.autorizada',
        n_itens: itens.length,
      },
      finalidade: 'cirurgia.opme.autorizada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.opme.autorizada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
