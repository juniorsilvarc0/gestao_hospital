/**
 * `DELETE /v1/atendimentos/:uuid` — soft-cancel.
 *
 * Cancelamento só vale para estados pré-clínicos (AGENDADO,
 * EM_ESPERA, EM_TRIAGEM, EM_ATENDIMENTO sem prescrição). Para
 * estados terminais (ALTA, INTERNADO) → 409 (use alta para
 * encerrar internação).
 *
 * Marca soft-delete (`deleted_at`) e move status para CANCELADO.
 * Conta associada é cancelada também.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CancelarAtendimentoDto } from '../dto/cancelar.dto';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';

const TERMINAL_STATUSES = new Set([
  'ALTA',
  'CANCELADO',
  'INTERNADO',
]);

@Injectable()
export class CancelarAtendimentoUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: CancelarAtendimentoDto,
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CancelarAtendimentoUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (TERMINAL_STATUSES.has(atend.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_INVALIDO',
        message: `Atendimento em status ${atend.status} não pode ser cancelado (use alta).`,
      });
    }

    await this.repo.setStatusCancelado(atend.id, dto.motivo, ctx.userId);

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.cancelado',
        motivo: dto.motivo,
        status_anterior: atend.status,
      },
      finalidade: 'atendimento.cancelado',
    });

    this.events.emit('atendimento.cancelado', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atend.id.toString(),
      atendimentoUuid,
    });
  }
}
