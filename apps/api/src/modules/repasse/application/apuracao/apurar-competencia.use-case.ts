/**
 * `POST /v1/repasse/apurar` — enfileira a apuração mensal e devolve
 * `{ jobId, status }` para que o front consulte progresso.
 *
 * Idempotência:
 *   - `jobId` é determinístico por (tenantId + competencia +
 *     prestadorUuids? + force). BullMQ rejeita re-add com mesmo jobId
 *     enquanto o job ainda está vivo (waiting/active/delayed) — isso
 *     evita disparos duplicados acidentais. Após `removeOnComplete`/
 *     `removeOnFail`, um novo disparo cria um job novo (intencional —
 *     útil para reapurações).
 */
import {
  ConflictException,
  Injectable,
  type LoggerService,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { QUEUE_REPASSE_APURAR } from '../../../../infrastructure/queues/queues.module';
import type { ApurarDto } from '../../dto/apurar.dto';
import type { ApurarResponse } from '../../dto/responses';
import type { ApuracaoJobData } from './apuracao-runner.service';

@Injectable()
export class ApurarCompetenciaUseCase {
  private readonly logger: LoggerService = new Logger(
    ApurarCompetenciaUseCase.name,
  );

  constructor(
    @InjectQueue(QUEUE_REPASSE_APURAR)
    private readonly queue: Queue<ApuracaoJobData>,
  ) {}

  async execute(dto: ApurarDto): Promise<ApurarResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ApurarCompetenciaUseCase requires request context.');
    }

    const prestadorUuids =
      dto.prestadorUuids === undefined ? null : dto.prestadorUuids;
    const force = dto.forceReapuracao ?? false;

    const jobId = this.computeJobId({
      tenantId: ctx.tenantId,
      competencia: dto.competencia,
      prestadorUuids,
      force,
    });

    const data: ApuracaoJobData = {
      tenantId: ctx.tenantId.toString(),
      userId: ctx.userId.toString(),
      correlationId: ctx.correlationId,
      competencia: dto.competencia,
      prestadorUuids,
      forceReapuracao: force,
    };

    try {
      await this.queue.add(`apurar-${jobId}`, data, { jobId });
    } catch (err) {
      // BullMQ devolve o job existente em vez de lançar — defesa.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        { jobId, err: msg },
        '[repasse:apurar] falha ao enfileirar (provável duplicate)',
      );
      throw new ConflictException({
        code: 'APURACAO_JA_ENFILEIRADA',
        message: 'Já existe apuração em andamento para esta competência.',
      });
    }

    const job = await this.queue.getJob(jobId);
    const status = job === undefined ? 'unknown' : await job.getState();

    return {
      jobId,
      status: status as ApurarResponse['status'],
      competencia: dto.competencia,
      enqueuedAt: new Date().toISOString(),
    };
  }

  /**
   * jobId determinístico — UUID v5-like baseado em SHA256(8 bytes).
   * Suficientemente único para o escopo (tenant×comp×prestadores×force)
   * e legível em logs.
   */
  private computeJobId(args: {
    tenantId: bigint;
    competencia: string;
    prestadorUuids: string[] | null;
    force: boolean;
  }): string {
    const sortedUuids =
      args.prestadorUuids === null
        ? 'all'
        : [...args.prestadorUuids].sort().join(',');
    const raw = `${args.tenantId.toString()}|${args.competencia}|${sortedUuids}|${args.force ? '1' : '0'}`;
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 32);
    // Formato tipo UUID para legibilidade em logs (não é UUID real).
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }
}
