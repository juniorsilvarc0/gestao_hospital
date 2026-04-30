/**
 * Use case: cria a linha em `import_jobs` (PENDENTE) e despacha
 * o job na queue `procedimentos:import`.
 */
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { QUEUE_PROCEDIMENTOS_IMPORT } from '../../../../infrastructure/queues/queues.module';
import type { ProcedimentosImportJobData } from '../../infrastructure/procedimentos-import.worker';

export interface StartImportJobInput {
  tipo: 'TUSS' | 'CBHPM' | 'CID10' | 'CBO';
  filePath: string;
  arquivoNome: string;
}

export interface StartImportJobOutput {
  jobUuid: string;
  status: string;
}

@Injectable()
export class StartImportJobUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_PROCEDIMENTOS_IMPORT)
    private readonly queue: Queue<ProcedimentosImportJobData>,
  ) {}

  async execute(input: StartImportJobInput): Promise<StartImportJobOutput> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('StartImportJobUseCase exige contexto autenticado.');
    }
    const tx = this.prisma.tx();

    const rows = await tx.$queryRaw<
      Array<{ id: bigint; uuid_externo: string }>
    >(Prisma.sql`
      INSERT INTO import_jobs (tenant_id, tipo, arquivo_nome, status, iniciado_por)
      VALUES (${ctx.tenantId}, ${input.tipo}, ${input.arquivoNome}, 'PENDENTE', ${ctx.userId})
      RETURNING id, uuid_externo
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Falha ao criar import_job.');
    }

    await this.queue.add(
      `${input.tipo.toLowerCase()}-${row.id.toString()}`,
      {
        tipo: input.tipo,
        filePath: input.filePath,
        tenantId: ctx.tenantId.toString(),
        userId: ctx.userId.toString(),
        correlationId: ctx.correlationId,
        importJobId: row.id.toString(),
      },
      { jobId: row.uuid_externo },
    );

    return {
      jobUuid: row.uuid_externo,
      status: 'PENDENTE',
    };
  }
}
