/**
 * `ApuracaoProcessor` — worker BullMQ da queue `repasse-apurar`.
 *
 * Lê o job e delega para `ApuracaoRunnerService.run()`. O worker em si
 * não tem lógica — toda a regra de domínio fica no runner para que
 * possa ser testada sem BullMQ/Postgres.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUE_REPASSE_APURAR } from '../../../infrastructure/queues/queues.module';
import {
  ApuracaoRunnerService,
  type ApuracaoJobData,
} from '../application/apuracao/apuracao-runner.service';
import type { ApuracaoJobResult } from '../dto/responses';

@Processor(QUEUE_REPASSE_APURAR)
export class ApuracaoProcessor extends WorkerHost {
  private readonly logger = new Logger(ApuracaoProcessor.name);

  constructor(private readonly runner: ApuracaoRunnerService) {
    super();
  }

  async process(job: Job<ApuracaoJobData>): Promise<ApuracaoJobResult> {
    const { tenantId, competencia, correlationId } = job.data;
    this.logger.log(
      { jobId: job.id, tenantId, competencia, correlationId },
      '[repasse:apurar] início',
    );

    const result = await this.runner.run(job.data);

    this.logger.log(
      {
        jobId: job.id,
        tenantId,
        competencia,
        prestadores: result.prestadoresProcessados,
        criados: result.repassesCriados,
        reapurados: result.repassesReapurados,
        ignorados: result.ignorados.length,
      },
      '[repasse:apurar] fim',
    );
    return result;
  }
}
