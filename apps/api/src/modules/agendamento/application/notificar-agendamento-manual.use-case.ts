/**
 * `NotificarAgendamentoManualUseCase` — Trilha B.
 *
 * Atende `POST /v1/agendamentos/:uuid/notificar`:
 *   - Resolve o agendamento por `uuid_externo` (filtra RLS pelo tenant
 *     do JWT — `prisma.tx()` carrega `app.current_tenant_id`).
 *   - Enfileira job NOVO (jobId não-determinístico para permitir
 *     múltiplos disparos manuais com canais diferentes) com `delay: 0`.
 *
 * 202 Accepted é a semântica certa: o endpoint não bloqueia esperando
 * o SMTP terminar; o consumer faz o envio em background com retry.
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL } from '../../../infrastructure/queues/queues.module';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AgendamentoRepository } from '../infrastructure/agendamento.repository';
import type { ConfirmacaoCanal } from '../infrastructure/notificacao-individual.worker';

export interface NotificarManualInput {
  agendamentoUuid: string;
  canal: ConfirmacaoCanal;
}

export interface NotificarManualResult {
  jobId: string;
  agendamentoUuid: string;
  canal: ConfirmacaoCanal;
}

@Injectable()
export class NotificarAgendamentoManualUseCase {
  private readonly logger = new Logger(NotificarAgendamentoManualUseCase.name);

  constructor(
    private readonly repo: AgendamentoRepository,
    @InjectQueue(QUEUE_AGENDAMENTOS_NOTIFICACAO_INDIVIDUAL)
    private readonly queue: Queue,
  ) {}

  async execute(input: NotificarManualInput): Promise<NotificarManualResult> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      // Defensivo: este use case só é chamado via HTTP autenticado
      // (TenantContextInterceptor já populou o storage).
      throw new Error('NotificarAgendamentoManualUseCase fora de request context');
    }

    const ag = await this.repo.findAgendamentoByUuid(input.agendamentoUuid);
    if (ag === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NAO_ENCONTRADO',
        message: 'Agendamento não encontrado.',
      });
    }

    const jobId = `confirm-manual-${ag.id.toString()}-${Date.now()}`;
    await this.queue.add(
      'notificar',
      {
        kind: 'notificar',
        agendamentoId: ag.id.toString(),
        tenantId: ctx.tenantId.toString(),
        canal: input.canal,
        correlationId: ctx.correlationId ?? randomUUID(),
      },
      { jobId, delay: 0 },
    );

    this.logger.log(
      {
        agendamentoUuid: ag.uuid_externo,
        canal: input.canal,
        correlationId: ctx.correlationId,
      },
      'agendamento.notificacao.manual_enfileirada',
    );

    return {
      jobId,
      agendamentoUuid: ag.uuid_externo,
      canal: input.canal,
    };
  }
}
