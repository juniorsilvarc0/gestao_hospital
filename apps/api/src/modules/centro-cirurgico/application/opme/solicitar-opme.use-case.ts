/**
 * `POST /v1/cirurgias/{uuid}/opme/solicitar` — fase 1 do fluxo OPME
 * (RN-CC-03).
 *
 * Permitida em AGENDADA / CONFIRMADA / EM_ANDAMENTO. Substitui o JSONB
 * `opme_solicitada`. O endpoint é idempotente — chamadas subsequentes
 * sobrescrevem o conteúdo (a UI deveria carregar o atual e mesclar).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { OpmeSolicitarDto } from '../../dto/opme.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from '../cirurgias/cirurgia.presenter';

const STATUSES_PERMITIDOS = new Set([
  'AGENDADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
]);

@Injectable()
export class SolicitarOpmeUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: OpmeSolicitarDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('SolicitarOpmeUseCase requires a request context.');
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
        message: `Cirurgia em status ${cir.status} não aceita solicitação OPME.`,
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
      fase: 'solicitada',
      itens,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.opme.solicitada',
        n_itens: itens.length,
      },
      finalidade: 'cirurgia.opme.solicitada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.opme.solicitada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
