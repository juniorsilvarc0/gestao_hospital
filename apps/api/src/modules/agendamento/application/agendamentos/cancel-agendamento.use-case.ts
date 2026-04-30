/**
 * `DELETE /v1/agendamentos/:uuid` — cancela com motivo.
 *
 * Soft cancel: muda status para CANCELADO, grava `cancelado_em`,
 * `cancelado_por`, `cancelamento_motivo`. Não apaga linha — preserva
 * histórico para auditoria + indicadores.
 *
 * Estados terminais (não permitem novo cancel): CANCELADO, REAGENDADO,
 * COMPARECEU, FALTOU. Tentar cancelar nesses estados → 409.
 *
 * RN-ATE-06: cancelamento dentro de 4h da hora marcada exige
 * justificativa (já obrigatória no DTO) e dispara evento adicional
 * `agendamento.cancelamento.curto_prazo` na auditoria.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CancelAgendamentoDto } from '../../dto/cancel-agendamento.dto';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';

const TERMINAL_STATUSES = new Set([
  'CANCELADO',
  'REAGENDADO',
  'COMPARECEU',
  'FALTOU',
]);

const QUATRO_HORAS_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class CancelAgendamentoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: CancelAgendamentoDto): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CancelAgendamentoUseCase requires a request context.');
    }

    const row = await this.repo.findAgendamentoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }
    if (TERMINAL_STATUSES.has(row.status)) {
      throw new ConflictException({
        code: 'AGENDAMENTO_ESTADO_TERMINAL',
        message: `Não é possível cancelar agendamento no status ${row.status}.`,
      });
    }

    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE agendamentos
         SET status = 'CANCELADO'::enum_agendamento_status,
             cancelado_em = now(),
             cancelado_por = ${ctx.userId}::bigint,
             cancelamento_motivo = ${dto.motivo},
             updated_at = now(),
             updated_by = ${ctx.userId}::bigint,
             versao = versao + 1
       WHERE id = ${row.id}::bigint
    `;

    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'agendamento.cancelado',
        motivo: dto.motivo,
        status_anterior: row.status,
      },
      finalidade: 'agendamento.cancelado',
    });

    // RN-ATE-06: cancelamento dentro de 4h da hora marcada.
    const agora = Date.now();
    const inicioMs = row.inicio.getTime();
    if (inicioMs > agora && inicioMs - agora < QUATRO_HORAS_MS) {
      await this.auditoria.record({
        tabela: 'agendamentos',
        registroId: row.id,
        operacao: 'U',
        diff: {
          evento: 'agendamento.cancelamento.curto_prazo',
          inicio: row.inicio.toISOString(),
          motivo: dto.motivo,
        },
        finalidade: 'agendamento.cancelamento.curto_prazo',
      });
    }
  }
}
