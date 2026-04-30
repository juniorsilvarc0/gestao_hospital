/**
 * Use case: `POST /tabelas-precos` — cria nova tabela (cabeçalho).
 */
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { CreateTabelaPrecosDto } from '../../dto/create-tabela-precos.dto';
import type { TabelaPrecosResponse } from '../../dto/tabela-precos.response';
import { presentTabela, type TabelaPrecosRow } from './tabela-precos.presenter';

@Injectable()
export class CreateTabelaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateTabelaPrecosDto): Promise<TabelaPrecosResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateTabelaUseCase exige contexto autenticado.');
    }

    const tx = this.prisma.tx();
    try {
      const rows = await tx.$queryRaw<TabelaPrecosRow[]>(Prisma.sql`
        INSERT INTO tabelas_precos (
          tenant_id, codigo, nome, vigencia_inicio, vigencia_fim, versao, ativa
        ) VALUES (
          ${ctx.tenantId},
          ${dto.codigo},
          ${dto.nome},
          ${dto.vigenciaInicio}::date,
          ${dto.vigenciaFim ?? null}::date,
          ${dto.versao ?? 1},
          ${dto.ativa ?? true}
        )
        RETURNING id, codigo, nome, vigencia_inicio, vigencia_fim, versao, ativa, created_at
      `);
      const row = rows[0];
      if (row === undefined) {
        throw new Error('Falha ao retornar tabela recém-criada.');
      }
      return presentTabela(row);
    } catch (err: unknown) {
      const sqlError = err as { code?: string };
      if (sqlError?.code === '23505') {
        throw new ConflictException({
          code: 'TABELA_PRECOS_DUPLICATE',
          message: `Já existe tabela com codigo=${dto.codigo} versão=${dto.versao ?? 1}.`,
        });
      }
      throw err;
    }
  }
}
