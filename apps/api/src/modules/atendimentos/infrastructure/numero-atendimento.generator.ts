/**
 * `NumeroAtendimentoGenerator` — produz `numero_atendimento` humano e
 * sequencial **por tenant** no formato `YYYY-NNNNNNNN`.
 *
 * Estratégia: usa um sequence Postgres dedicado ao tenant, criado
 * lazily na primeira chamada (`CREATE SEQUENCE IF NOT EXISTS`).
 *
 * Por que sequence dedicado? Sequences são lock-free e não rollbackam.
 * Garante unicidade mesmo em INSERTs concorrentes — combinado com o
 * `UNIQUE (tenant_id, numero_atendimento)` é defesa em camadas.
 *
 * Por que NÃO `MAX(...) + 1`? Race condition clássico: dois INSERTs
 * pegam o mesmo MAX e colidem na constraint UNIQUE.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

@Injectable()
export class NumeroAtendimentoGenerator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera próximo número de atendimento para o `tenantId` informado.
   * Formato: `YYYY-00000001` (ano corrente + 8 dígitos zero-fill).
   */
  async next(tenantId: bigint): Promise<string> {
    const tx = this.prisma.tx();
    const seqName = `seq_atend_t${tenantId.toString()}`;
    // CREATE SEQUENCE IF NOT EXISTS — idempotente; primeira chamada paga
    // o custo, demais não. A criação não pode ser parametrizada (DDL),
    // logo usamos identifier seguro derivado do tenantId numérico.
    if (!/^seq_atend_t\d+$/.test(seqName)) {
      throw new Error('Invalid seqName derived from tenantId');
    }
    await tx.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START 1`,
    );
    const rows = await tx.$queryRawUnsafe<Array<{ nextval: bigint }>>(
      `SELECT nextval('${seqName}') AS nextval`,
    );
    const seq = rows[0].nextval;
    const ano = new Date().getUTCFullYear();
    const padded = seq.toString().padStart(8, '0');
    return `${ano}-${padded}`;
  }
}
