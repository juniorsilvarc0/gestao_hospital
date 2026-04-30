/**
 * `PermissionsGuard` — RBAC.
 *
 * Roda DEPOIS do `JwtAuthGuard` (ordem registrada em AppModule via
 * `APP_GUARD`). Lê `@RequirePermission(recurso, acao)` no handler:
 *
 *   - Se rota é `@Public()`: deixa passar (já tratado em JwtAuthGuard,
 *     mas duplicamos a checagem aqui por segurança).
 *   - Se handler **não tem** `@RequirePermission`: deixa passar.
 *     Convenção: handlers sem decorator estão na zona "autenticado é
 *     suficiente" (ex.: `/users/me`).
 *   - Se tem: consulta cache (60s TTL); cache miss vai ao banco
 *     resolvendo perfis_permissoes do usuário (filtrado por tenant
 *     do contexto). Negativa → 403.
 *
 * **Importante**: usa `prisma.tx()` — ou seja, executa dentro da
 * transação do `TenantContextInterceptor` quando ele estiver à frente
 * (que é o caso para todo handler protegido).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  type RequiredPermission,
} from '../decorators/require-permission.decorator';
import { PermissionsCacheService } from '../cache/permissions-cache.service';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (user === undefined) {
      throw new ForbiddenException({
        code: 'AUTH_NOT_AUTHENTICATED',
        message: 'Usuário não autenticado.',
      });
    }

    const allowed = await this.hasPermission(
      user.sub,
      user.tid,
      required.recurso,
      required.acao,
    );

    if (!allowed) {
      this.logger.debug(
        {
          correlationId: request.correlationId,
          userId: user.sub.toString(),
          tenantId: user.tid.toString(),
          recurso: required.recurso,
          acao: required.acao,
        },
        'rbac.deny',
      );
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: `Acesso negado: ${required.recurso}:${required.acao}`,
      });
    }

    return true;
  }

  private async hasPermission(
    usuarioId: bigint,
    tenantId: bigint,
    recurso: string,
    acao: string,
  ): Promise<boolean> {
    const cached = await this.cache.get(usuarioId, recurso, acao);
    if (cached !== undefined) {
      return cached;
    }

    // O guard roda ANTES do TenantContextInterceptor (ordem do Nest:
    // guards → interceptors). Sem SET LOCAL, RLS em `perfis` filtra tudo
    // → 0 resultados. Aqui abrimos uma transação curta apenas para
    // setar o tenant a partir do JWT (já validado em JwtAuthGuard) e
    // executar a checagem.
    if (!/^\d+$/.test(tenantId.toString())) {
      throw new ForbiddenException({
        code: 'AUTH_INVALID_TENANT',
        message: 'Tenant inválido no token.',
      });
    }
    const allow = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      const found = await tx.usuarioPerfil.findFirst({
        where: {
          usuarioId,
          perfil: {
            ativo: true,
            permissoes: {
              some: { permissao: { recurso, acao } },
            },
          },
        },
        select: { perfilId: true },
      });
      return found !== null;
    });

    await this.cache.set(usuarioId, recurso, acao, allow);
    return allow;
  }
}
