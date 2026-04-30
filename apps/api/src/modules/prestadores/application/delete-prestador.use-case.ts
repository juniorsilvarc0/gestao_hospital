/**
 * Use case: `DELETE /v1/prestadores/:uuid` — soft-delete (CLAUDE.md §2.1).
 *
 * Marca `deleted_at = now()` + `ativo = false`. Não toca em
 * `prestadores_especialidades` (M:N permanece para histórico).
 *
 * tg_audit registra UPDATE com diff JSONB.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

@Injectable()
export class DeletePrestadorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(uuid: string): Promise<void> {
    const tx = this.prisma.tx();
    const existing = await tx.prestadores.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }

    await tx.prestadores.update({
      where: { id: existing.id },
      data: {
        deleted_at: new Date(),
        ativo: false,
        updated_at: new Date(),
      },
    });
  }
}
