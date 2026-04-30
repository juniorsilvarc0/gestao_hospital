/**
 * Use case: `GET /tabelas-procedimentos/jobs/:uuid`.
 *
 * Retorna o estado atual do job (consultado em tabela; não da queue).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';

export interface ImportJobResponse {
  jobUuid: string;
  tipo: string;
  status: string;
  total: number;
  processados: number;
  erros: number;
  arquivoNome: string | null;
  errorLog: unknown;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  createdAt: string;
}

interface ImportJobRow {
  uuid_externo: string;
  tipo: string;
  status: string;
  total: number;
  processados: number;
  erros: number;
  arquivo_nome: string | null;
  error_log: unknown;
  iniciado_em: Date | null;
  concluido_em: Date | null;
  created_at: Date;
}

@Injectable()
export class GetImportJobUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(jobUuid: string): Promise<ImportJobResponse> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ImportJobRow[]>(Prisma.sql`
      SELECT uuid_externo, tipo, status, total, processados, erros,
             arquivo_nome, error_log, iniciado_em, concluido_em, created_at
        FROM import_jobs
       WHERE uuid_externo = ${jobUuid}::uuid
       LIMIT 1
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Job de importação "${jobUuid}" não encontrado.`,
      });
    }

    return {
      jobUuid: row.uuid_externo,
      tipo: row.tipo,
      status: row.status,
      total: row.total,
      processados: row.processados,
      erros: row.erros,
      arquivoNome: row.arquivo_nome,
      errorLog: row.error_log,
      iniciadoEm:
        row.iniciado_em !== null ? row.iniciado_em.toISOString() : null,
      concluidoEm:
        row.concluido_em !== null ? row.concluido_em.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }
}
