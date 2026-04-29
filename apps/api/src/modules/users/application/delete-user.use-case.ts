/**
 * Use case: `DELETE /users/{uuid}` (admin) — soft-delete (RN §2.1
 * CLAUDE.md). Marca `deleted_at = now()` e `ativo = false`.
 *
 * Bloqueia auto-deleção (admin não pode se apagar — evita lockout
 * total do sistema em tenants single-admin).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { PermissionsCacheService } from '../../../common/cache/permissions-cache.service';

@Injectable()
export class DeleteUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async execute(uuid: string): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DeleteUserUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const existing = await tx.usuario.findFirst({
      where: { uuidExterno: uuid },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    if (existing.id === ctx.userId) {
      throw new BadRequestException({
        code: 'USER_CANNOT_DELETE_SELF',
        message: 'Você não pode desativar a própria conta.',
      });
    }

    await tx.usuario.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), ativo: false },
    });

    // Revoga sessões ativas do usuário (defensa extra — Fase 2 manual).
    await tx.sessaoAtiva.updateMany({
      where: { usuarioId: existing.id, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });

    await this.cache.invalidateUser(existing.id);
  }
}
