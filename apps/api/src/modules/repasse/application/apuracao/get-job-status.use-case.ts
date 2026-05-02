/**
 * `GET /v1/repasse/apurar/:jobId/status` — devolve o estado do job
 * BullMQ + resultado quando concluído.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { QUEUE_REPASSE_APURAR } from '../../../../infrastructure/queues/queues.module';
import type {
  ApuracaoJobResult,
  ApurarResponse,
  JobStatusResponse,
} from '../../dto/responses';
import type { ApuracaoJobData } from './apuracao-runner.service';

@Injectable()
export class GetJobStatusUseCase {
  constructor(
    @InjectQueue(QUEUE_REPASSE_APURAR)
    private readonly queue: Queue<ApuracaoJobData, ApuracaoJobResult>,
  ) {}

  async execute(jobId: string): Promise<JobStatusResponse> {
    const job = await this.queue.getJob(jobId);
    if (job === undefined) {
      throw new NotFoundException({
        code: 'APURACAO_JOB_NOT_FOUND',
        message: 'Job de apuração não encontrado (pode ter sido removido após conclusão).',
      });
    }
    const state = (await job.getState()) as ApurarResponse['status'];
    const progressRaw = job.progress;
    const progress =
      typeof progressRaw === 'number' ? progressRaw : null;

    const result: ApuracaoJobResult | null =
      state === 'completed' && job.returnvalue !== undefined && job.returnvalue !== null
        ? (job.returnvalue as ApuracaoJobResult)
        : null;

    const failedReason: string | null =
      state === 'failed' ? job.failedReason ?? null : null;

    return {
      jobId,
      status: state,
      progress,
      result,
      failedReason,
      enqueuedAt: new Date(job.timestamp).toISOString(),
      finishedAt:
        job.finishedOn === undefined || job.finishedOn === null
          ? null
          : new Date(job.finishedOn).toISOString(),
      attemptsMade: job.attemptsMade ?? 0,
    };
  }
}
