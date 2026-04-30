/**
 * Use case: `GET /v1/especialidades` — lista catálogo CBOS do tenant.
 *
 * Sem paginação (catálogo pequeno por tenant — ~30 especialidades).
 * Filtra por `ativo` se solicitado.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface EspecialidadeListItem {
  uuid: string;
  codigoCbos: string;
  nome: string;
  ativo: boolean;
}

@Injectable()
export class ListEspecialidadesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(filters: {
    apenasAtivos?: boolean;
  }): Promise<{ data: EspecialidadeListItem[] }> {
    const tx = this.prisma.tx();

    const rows = await tx.especialidades.findMany({
      where: filters.apenasAtivos === true ? { ativo: true } : undefined,
      orderBy: { nome: 'asc' },
    });

    return {
      data: rows.map(
        (row): EspecialidadeListItem => ({
          // Catálogo ainda sem uuid_externo no DB. `codigo_cbos` é estável
          // por tenant — usamos como identificador externo até a migração
          // dedicada (`add_uuid_externo_especialidades`).
          uuid:
            (row as unknown as { uuid_externo?: string }).uuid_externo ??
            row.codigo_cbos,
          codigoCbos: row.codigo_cbos,
          nome: row.nome,
          ativo: row.ativo,
        }),
      ),
    };
  }
}
