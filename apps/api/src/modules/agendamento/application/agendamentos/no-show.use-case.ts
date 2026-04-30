/**
 * `POST /v1/agendamentos/:uuid/no-show` — marca FALTOU.
 *
 * Regras (RN-AGE-04):
 *   - Status atual deve ser AGENDADO ou CONFIRMADO.
 *   - `inicio` precisa ter passado de `now() - 15min` (grace period;
 *     evita marcar no-show enquanto paciente está chegando atrasado).
 *
 * O job `no-show.worker` (Trilha B) também usa esta lógica em batch.
 * Aqui é o disparo MANUAL (recepção/admin).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { NoShowAgendamentoDto } from '../../dto/checkin.dto';
import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentAgendamento } from './agendamento.presenter';

const GRACE_MS = 15 * 60 * 1000;

@Injectable()
export class NoShowUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: NoShowAgendamentoDto,
  ): Promise<AgendamentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('NoShowUseCase requires a request context.');
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
        message: `Não é possível marcar no-show com status ${row.status}.`,
      });
    }

    const agora = Date.now();
    if (row.inicio.getTime() > agora - GRACE_MS) {
      throw new UnprocessableEntityException({
        code: 'AGENDAMENTO_NO_SHOW_PREMATURO',
        message:
          'Aguarde 15 min após o horário marcado antes de marcar no-show (RN-AGE-04).',
      });
    }

    const tx = this.prisma.tx();
    const sets: Prisma.Sql[] = [
      Prisma.sql`status = 'FALTOU'::enum_agendamento_status`,
      Prisma.sql`no_show_marcado_em = now()`,
      Prisma.sql`updated_at = now()`,
      Prisma.sql`updated_by = ${ctx.userId}::bigint`,
      Prisma.sql`versao = versao + 1`,
    ];
    if (dto.motivo !== undefined) {
      sets.push(Prisma.sql`observacao = ${dto.motivo}`);
    }
    await tx.$executeRaw(
      Prisma.sql`UPDATE agendamentos SET ${Prisma.join(sets, ', ')}
                  WHERE id = ${row.id}::bigint`,
    );

    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'agendamento.no_show',
        motivo: dto.motivo ?? null,
        manual: true,
      },
      finalidade: 'agendamento.no_show',
    });

    const updated = await this.repo.findAgendamentoByUuid(uuid);
    return presentAgendamento(updated ?? row);
  }
}
