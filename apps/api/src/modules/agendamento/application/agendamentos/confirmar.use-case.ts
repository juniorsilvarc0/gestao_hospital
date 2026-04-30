/**
 * `POST /v1/agendamentos/:uuid/confirmar` — RN-AGE-03 (confirmação manual).
 *
 * Aceita body `{via?: 'PORTAL'|'TELEFONE'|'RECEPCAO'|'SMS'|'EMAIL'|'WHATSAPP'}`.
 * Atualiza `confirmado_em`, `confirmado_por`, `confirmado_via` e
 * status `AGENDADO` → `CONFIRMADO`. Idempotente: se já estiver
 * `CONFIRMADO`, atualiza apenas `confirmado_via` (se vier).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { ConfirmarAgendamentoDto } from '../../dto/checkin.dto';
import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentAgendamento } from './agendamento.presenter';

const VIAS_VALIDAS = new Set([
  'PORTAL',
  'TELEFONE',
  'RECEPCAO',
  'SMS',
  'EMAIL',
  'WHATSAPP',
]);

@Injectable()
export class ConfirmarUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: ConfirmarAgendamentoDto,
  ): Promise<AgendamentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ConfirmarUseCase requires a request context.');
    }

    const agend = await this.repo.findAgendamentoByUuid(uuid);
    if (agend === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }
    if (
      agend.status !== 'AGENDADO' &&
      agend.status !== 'CONFIRMADO'
    ) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_STATUS_INVALIDO',
        message: `Não é possível confirmar com status ${agend.status}.`,
      });
    }

    const via = dto.via?.toUpperCase();
    if (via !== undefined && !VIAS_VALIDAS.has(via)) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_VIA_INVALIDA',
        message: `via deve ser uma de ${[...VIAS_VALIDAS].join(', ')}.`,
      });
    }

    const tx = this.prisma.tx();
    const sets: Prisma.Sql[] = [
      Prisma.sql`status = 'CONFIRMADO'::enum_agendamento_status`,
      Prisma.sql`confirmado_em = now()`,
      Prisma.sql`confirmado_por = ${ctx.userId}::bigint`,
      Prisma.sql`updated_at = now()`,
      Prisma.sql`updated_by = ${ctx.userId}::bigint`,
      Prisma.sql`versao = versao + 1`,
    ];
    if (via !== undefined) {
      sets.push(Prisma.sql`confirmado_via = ${via}`);
    }
    await tx.$executeRaw(
      Prisma.sql`UPDATE agendamentos SET ${Prisma.join(sets, ', ')}
                  WHERE id = ${agend.id}::bigint`,
    );

    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: agend.id,
      operacao: 'U',
      diff: { evento: 'agendamento.confirmado', via: via ?? null },
      finalidade: 'agendamento.confirmado',
    });

    const updated = await this.repo.findAgendamentoByUuid(uuid);
    return presentAgendamento(updated ?? agend);
  }
}
