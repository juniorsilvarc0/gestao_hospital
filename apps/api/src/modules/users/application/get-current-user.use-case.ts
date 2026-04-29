/**
 * Use case: `GET /users/me` — devolve o perfil do usuário autenticado.
 *
 * Sempre permitido para usuários autenticados (sem `@RequirePermission`).
 * Lê via `prisma.tx()` → RLS já garante que só busca dados do tenant
 * atual.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { UserResponse } from '../dto/user.response';
import { presentUser, type UsuarioWithPerfis } from './user.presenter';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(usuarioId: bigint): Promise<UserResponse> {
    const tx = this.prisma.tx();
    const usuario = (await tx.usuario.findFirst({
      where: { id: usuarioId },
      include: {
        perfis: { include: { perfil: { select: { codigo: true } } } },
      },
    })) as UsuarioWithPerfis | null;

    if (usuario === null) {
      // Esse caso é praticamente impossível (JWT acabou de validar),
      // mas blindamos para o caso de soft-delete entre o login e a
      // chamada subsequente.
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }
    return presentUser(usuario);
  }
}
