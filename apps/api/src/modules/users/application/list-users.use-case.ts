/**
 * Use case: `GET /users` (admin) — lista paginada de usuários do tenant.
 *
 * Filtra automaticamente por tenant via RLS (`prisma.tx()`).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ListUsersQueryDto } from '../dto/list-users.dto';
import type { PaginatedResponse, UserResponse } from '../dto/user.response';
import { presentUser, type UsuarioWithPerfis } from './user.presenter';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListUsersQueryDto,
  ): Promise<PaginatedResponse<UserResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tx = this.prisma.tx();

    const where: Prisma.UsuarioWhereInput = {};
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { nome: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.ativo !== undefined) {
      where.ativo = query.ativo;
    }

    const [total, items] = await Promise.all([
      tx.usuario.count({ where }),
      tx.usuario.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          perfis: { include: { perfil: { select: { codigo: true } } } },
        },
      }),
    ]);

    return {
      data: items.map((u) => presentUser(u as UsuarioWithPerfis)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
