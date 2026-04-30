/**
 * `AgendarNotificacao24hUseCase` — Trilha B.
 *
 * Enfileira (ou re-agenda / cancela) o job INDIVIDUAL de notificação
 * de confirmação 24h (RN-AGE-03) na queue
 * `agendamentos-notificacao-individual`. Convive com o cron sweep
 * Trilha A (`ConfirmacaoWorker`) — as duas estratégias são
 * complementares.
 *
 * Operações:
 *   - `agendar(input)`: cria job com `delay = max(0, inicio - 24h - now)`.
 *      JobId determinístico `confirm-${agendamentoId}` (idempotência).
 *   - `reagendar(input)`: remove o job anterior e cria novo.
 *   - `cancelar(agendamentoId)`: remove o job sem criar novo.
 *
 * Quando chamar (Trilha A):
 *   - Após `INSERT` em `agendamentos` (CreateAgendamentoUseCase).
 *   - Em reagendamento (UpdateAgendamentoUseCase).
 *   - Em cancelamento (CancelAgendamentoUseCase).
 *
 * Acoplamento mínimo: depende apenas da queue + DTO. Trilha A pode
 * importar este use case sem trazer worker/SMTP junto.
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL } from '../../../infrastructure/queues/queues.module';
import type { ConfirmacaoCanal } from '../infrastructure/notificacao-individual.worker';

const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

export interface AgendarInput {
  agendamentoId: bigint;
  tenantId: bigint;
  inicio: Date;
  /** Canal preferencial. Default: EMAIL. */
  canal?: ConfirmacaoCanal;
  correlationId: string;
}

@Injectable()
export class AgendarNotificacao24hUseCase {
  private readonly logger = new Logger(AgendarNotificacao24hUseCase.name);

  constructor(
    @InjectQueue(QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL)
    private readonly queue: Queue,
  ) {}

  async agendar(
    input: AgendarInput,
  ): Promise<{ jobId: string; delay: number }> {
    const jobId = deterministicJobId(input.agendamentoId);
    const delay = computeDelayMs(input.inicio);
    const canal: ConfirmacaoCanal = input.canal ?? 'EMAIL';

    await this.queue.add(
      'notificar',
      {
        kind: 'notificar',
        agendamentoId: input.agendamentoId.toString(),
        tenantId: input.tenantId.toString(),
        canal,
        correlationId: input.correlationId,
      },
      { jobId, delay },
    );

    this.logger.log(
      {
        agendamentoId: input.agendamentoId.toString(),
        delay,
        canal,
        correlationId: input.correlationId,
      },
      'agendamento.notificacao.enfileirada',
    );

    return { jobId, delay };
  }

  async reagendar(
    input: AgendarInput,
  ): Promise<{ jobId: string; delay: number }> {
    await this.cancelar(input.agendamentoId);
    return this.agendar(input);
  }

  async cancelar(agendamentoId: bigint): Promise<boolean> {
    const jobId = deterministicJobId(agendamentoId);
    const job = await this.queue.getJob(jobId);
    if (job === undefined || job === null) {
      return false;
    }
    try {
      await job.remove();
      return true;
    } catch (err) {
      this.logger.debug(
        {
          agendamentoId: agendamentoId.toString(),
          err: err instanceof Error ? err.message : String(err),
        },
        'agendamento.notificacao.cancel_skip',
      );
      return false;
    }
  }
}

export function deterministicJobId(agendamentoId: bigint): string {
  return `confirm-${agendamentoId.toString()}`;
}

/**
 * `delay = inicio - 24h - now`. Se já estamos dentro da janela 24h,
 * delay 0 (envio imediato).
 */
export function computeDelayMs(inicio: Date, now: Date = new Date()): number {
  const target = inicio.getTime() - VINTE_QUATRO_HORAS_MS;
  return Math.max(0, target - now.getTime());
}
