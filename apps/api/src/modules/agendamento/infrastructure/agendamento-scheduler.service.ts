/**
 * `AgendamentoSchedulerService` — registra os repeatable jobs BullMQ
 * que sustentam os fluxos automáticos de agendamento.
 *
 * Por que registrar no boot?
 *   BullMQ não persiste um cron na queue: a cada start a aplicação
 *   precisa **declarar** o repeat. `JobScheduler` (`upsertJobScheduler`)
 *   é idempotente — chamar com o mesmo `id` simplesmente atualiza/recria
 *   o agendamento, então rodar no boot está correto e não duplica.
 *
 * Cron usado:
 *   - `agendamentos-confirmacao`: `0 9 * * *` em America/Sao_Paulo
 *     (todo dia às 09:00 BRT/BRST). RN-AGE-03.
 *   - `agendamentos-no-show`: `every 15 min`. RN-AGE-04.
 *
 * Observações:
 *   - `@nestjs/bullmq` injeta a queue via `@InjectQueue(name)`.
 *   - `OnApplicationBootstrap` roda DEPOIS de `onModuleInit` de todos
 *     os módulos — Prisma já está conectado, o que importa para o
 *     próximo step (workers começam a processar).
 *   - Em testes (`NODE_ENV=test`) o scheduling é pulado para evitar
 *     que o vitest acumule jobs em Redis durante CI local.
 */
import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  QUEUE_AGENDAMENTOS_CONFIRMACAO,
  QUEUE_AGENDAMENTOS_NO_SHOW,
} from '../../../infrastructure/queues/queues.module';

const TIMEZONE_BR = 'America/Sao_Paulo';

@Injectable()
export class AgendamentoSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendamentoSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_AGENDAMENTOS_CONFIRMACAO)
    private readonly confirmacaoQueue: Queue,
    @InjectQueue(QUEUE_AGENDAMENTOS_NO_SHOW)
    private readonly noShowQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('NODE_ENV=test — pulando registro de repeatable jobs');
      return;
    }
    await this.registrarConfirmacao();
    await this.registrarNoShow();
  }

  private async registrarConfirmacao(): Promise<void> {
    await this.confirmacaoQueue.upsertJobScheduler(
      'cron-confirmacao-09h',
      {
        pattern: '0 9 * * *',
        tz: TIMEZONE_BR,
      },
      {
        name: 'confirmacao-24h-tick',
        data: {},
      },
    );
    this.logger.log(
      `Repeat job registrado: ${QUEUE_AGENDAMENTOS_CONFIRMACAO} cron='0 9 * * *' tz=${TIMEZONE_BR}`,
    );
  }

  private async registrarNoShow(): Promise<void> {
    await this.noShowQueue.upsertJobScheduler(
      'every-15min-no-show',
      {
        every: 15 * 60 * 1000,
      },
      {
        name: 'no-show-tick',
        data: {},
      },
    );
    this.logger.log(
      `Repeat job registrado: ${QUEUE_AGENDAMENTOS_NO_SHOW} every=15min`,
    );
  }
}
