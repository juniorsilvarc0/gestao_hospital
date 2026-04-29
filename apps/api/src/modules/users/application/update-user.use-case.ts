/**
 * Use case: `PATCH /users/{uuid}` (admin) — atualiza dados do usuário.
 *
 * Não toca em senha (auto-serviço em `/auth/password/change`).
 * Não toca em MFA (auto-serviço em `/auth/mfa/*`).
 * Não troca perfis (use `POST /users/{uuid}/perfis`).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { UpdateUserDto } from '../dto/update-user.dto';
import type { UserResponse } from '../dto/user.response';
import { presentUser, type UsuarioWithPerfis } from './user.presenter';
import { PermissionsCacheService } from '../../../common/cache/permissions-cache.service';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async execute(uuid: string, dto: UpdateUserDto): Promise<UserResponse> {
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

    const data: Prisma.UsuarioUpdateInput = {};
    if (dto.email !== undefined) {
      data.email = dto.email.toLowerCase();
    }
    if (dto.nome !== undefined) {
      data.nome = dto.nome;
    }
    if (dto.ativo !== undefined) {
      data.ativo = dto.ativo;
    }

    let updated: UsuarioWithPerfis;
    try {
      updated = (await tx.usuario.update({
        where: { id: existing.id },
        data,
        include: {
          perfis: { include: { perfil: { select: { codigo: true } } } },
        },
      })) as unknown as UsuarioWithPerfis;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'USER_EMAIL_TAKEN',
          message: 'Já existe um usuário com este email no tenant.',
        });
      }
      throw err;
    }

    // Quando ativo muda para false, sessão pode estar válida — invalidar
    // cache de permissões para forçar re-checagem rápida.
    if (dto.ativo !== undefined) {
      await this.cache.invalidateUser(existing.id);
    }

    return presentUser(updated);
  }
}
