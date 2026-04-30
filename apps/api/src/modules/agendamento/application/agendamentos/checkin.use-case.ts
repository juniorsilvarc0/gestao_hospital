/**
 * `POST /v1/agendamentos/:uuid/checkin` — recepção registra comparecimento.
 *
 * Estado válido para check-in: AGENDADO ou CONFIRMADO. Demais → 409.
 * Define `checkin_em`, `checkin_por` e status → COMPARECEU.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CheckinAgendamentoDto } from '../../dto/checkin.dto';
import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentAgendamento } from './agendamento.presenter';

@Injectable()
export class CheckinUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: CheckinAgendamentoDto,
  ): Promise<AgendamentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CheckinUseCase requires a request context.');
    }

    const row = await this.repo.findAgendamentoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }
    if (row.status !== 'AGENDADO' && row.status !== 'CONFIRMADO') {
      throw new ConflictException({
        code: 'AGENDAMENTO_STATUS_INVALIDO',
        message: `Não é possível dar check-in com status ${row.status}.`,
      });
    }

    const tx = this.prisma.tx();
    const sets: Prisma.Sql[] = [
      Prisma.sql`status = 'COMPARECEU'::enum_agendamento_status`,
      Prisma.sql`checkin_em = now()`,
      Prisma.sql`checkin_por = ${ctx.userId}::bigint`,
      Prisma.sql`updated_at = now()`,
      Prisma.sql`updated_by = ${ctx.userId}::bigint`,
      Prisma.sql`versao = versao + 1`,
    ];
    if (dto.observacao !== undefined) {
      sets.push(Prisma.sql`observacao = ${dto.observacao}`);
    }
    await tx.$executeRaw(
      Prisma.sql`UPDATE agendamentos SET ${Prisma.join(sets, ', ')}
                  WHERE id = ${row.id}::bigint`,
    );

    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: row.id,
      operacao: 'U',
      diff: { evento: 'agendamento.checkin' },
      finalidade: 'agendamento.checkin',
    });

    const updated = await this.repo.findAgendamentoByUuid(uuid);
    return presentAgendamento(updated ?? row);
  }
}
