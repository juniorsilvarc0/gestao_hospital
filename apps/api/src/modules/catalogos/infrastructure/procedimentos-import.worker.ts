/**
 * Worker BullMQ para a queue `procedimentos:import`.
 *
 * Fluxo:
 *   1. Lê o arquivo do disco (`filePath`).
 *   2. Atualiza `import_jobs.status = 'EM_PROCESSAMENTO'`.
 *   3. Roda parser correspondente ao `tipo`.
 *   4. Quebra em chunks (CHUNK_SIZE) e chama `UpsertProcedimentoBulkUseCase`.
 *   5. Atualiza `processados` e `erros` ao longo do progresso.
 *   6. No final, marca `CONCLUIDO` ou `FALHOU` e remove o arquivo temp.
 *
 * Observações:
 *   - O worker NÃO tem RequestContext (não está em HTTP). Por isso o
 *     use case de upsert recebe `tenantId` explícito e abre transação
 *     com `SET LOCAL app.current_tenant_id` (igual ao Interceptor faz).
 *   - Erros de parsing são logados em `error_log` (até 100 por job).
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { promises as fs } from 'node:fs';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { QUEUE_PROCEDIMENTOS_IMPORT } from '../../../infrastructure/queues/queues.module';
import { UpsertProcedimentoBulkUseCase } from '../application/procedimentos/upsert-procedimento-bulk.use-case';
import { parseTussCsv } from './tuss-csv-parser';
import { parseCbhpmCsv } from './cbhpm-csv-parser';
import type { ParseError, ParseResult } from './tuss-csv-parser';

const CHUNK_SIZE = 500;
const MAX_ERROR_LOG = 100;

export interface ProcedimentosImportJobData {
  filePath: string;
  tipo: 'TUSS' | 'CBHPM' | 'CID10' | 'CBO';
  tenantId: string; // serializado para BullMQ (BigInt não é JSON-safe)
  userId: string;
  correlationId: string;
  importJobId: string;
}

@Processor(QUEUE_PROCEDIMENTOS_IMPORT)
export class ProcedimentosImportWorker extends WorkerHost {
  private readonly logger = new Logger(ProcedimentosImportWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upsertBulk: UpsertProcedimentoBulkUseCase,
  ) {
    super();
  }

  async process(job: Job<ProcedimentosImportJobData>): Promise<{
    processados: number;
    erros: number;
  }> {
    const { filePath, tipo, tenantId, importJobId, correlationId } = job.data;
    const tenantIdBig = BigInt(tenantId);
    const importJobIdBig = BigInt(importJobId);

    this.logger.log(
      { tipo, importJobId, correlationId },
      `[procedimentos:import] início — file=${filePath}`,
    );

    await this.markRunning(importJobIdBig, tenantIdBig);

    let result: ParseResult;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (tipo === 'TUSS') {
        result = parseTussCsv(content);
      } else if (tipo === 'CBHPM') {
        result = parseCbhpmCsv(content);
      } else {
        await this.markFailed(importJobIdBig, tenantIdBig, [
          {
            line: 0,
            message: `Importação tipo "${tipo}" ainda não implementada (placeholder).`,
          },
        ]);
        return { processados: 0, erros: 1 };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(importJobIdBig, tenantIdBig, [
        { line: 0, message: `Erro lendo CSV: ${message}` },
      ]);
      throw err;
    }

    // Atualiza total inicialmente para que o front possa exibir % de progresso.
    await this.updateProgress(
      importJobIdBig,
      tenantIdBig,
      0,
      result.errors.length,
      result.totalLines,
    );

    let processados = 0;
    let erros = result.errors.length;
    for (let i = 0; i < result.rows.length; i += CHUNK_SIZE) {
      const chunk = result.rows.slice(i, i + CHUNK_SIZE);
      try {
        const r = await this.upsertBulk.execute(tenantIdBig, chunk);
        processados += r.affected;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        erros += chunk.length;
        result.errors.push({
          line: i + 2,
          message: `Falha em chunk: ${message}`,
        });
        this.logger.warn(
          { importJobId, correlationId, err: message },
          '[procedimentos:import] erro em chunk',
        );
      }
      await this.updateProgress(
        importJobIdBig,
        tenantIdBig,
        processados,
        erros,
        result.totalLines,
      );
      await job.updateProgress(
        Math.floor((processados / Math.max(1, result.totalLines)) * 100),
      );
    }

    await this.markCompleted(
      importJobIdBig,
      tenantIdBig,
      processados,
      erros,
      result.errors.slice(0, MAX_ERROR_LOG),
    );

    // Best-effort: remove arquivo temp.
    fs.unlink(filePath).catch(() => undefined);

    this.logger.log(
      { importJobId, processados, erros },
      `[procedimentos:import] fim`,
    );
    return { processados, erros };
  }

  private async markRunning(jobId: bigint, tenantId: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET status='EM_PROCESSAMENTO', iniciado_em=now() WHERE id = $1`,
        jobId,
      );
    });
  }

  private async updateProgress(
    jobId: bigint,
    tenantId: bigint,
    processados: number,
    erros: number,
    total: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET processados=$1, erros=$2, total=$3 WHERE id = $4`,
        processados,
        erros,
        total,
        jobId,
      );
    });
  }

  private async markCompleted(
    jobId: bigint,
    tenantId: bigint,
    processados: number,
    erros: number,
    errorList: ParseError[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs
            SET status='CONCLUIDO',
                processados=$1,
                erros=$2,
                error_log=$3::jsonb,
                concluido_em=now()
          WHERE id = $4`,
        processados,
        erros,
        JSON.stringify({ errors: errorList }),
        jobId,
      );
    });
  }

  private async markFailed(
    jobId: bigint,
    tenantId: bigint,
    errorList: ParseError[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs
            SET status='FALHOU',
                erros=$1,
                error_log=$2::jsonb,
                concluido_em=now()
          WHERE id = $3`,
        errorList.length,
        JSON.stringify({ errors: errorList }),
        jobId,
      );
    });
  }
}
