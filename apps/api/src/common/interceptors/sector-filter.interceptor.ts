/**
 * `SectorFilterInterceptor` — ABAC.
 *
 * Roda APÓS `JwtAuthGuard` + `PermissionsGuard` + `TenantContextInterceptor`.
 *
 * Stub Fase 2: ainda não temos `usuario_setores` no schema. O contrato
 * com handlers já está pronto:
 *   - Verifica permissão override `<recurso>:<acaoBase>:all` via cache.
 *   - Se tem override → `request.sectorFilter = null` (sem filtro).
 *   - Senão → `request.sectorFilter = []` (deny-by-default temporário
 *     até Fase 3 popular setores do usuário).
 *
 * TODO Fase 3 (Cadastros):
 *   - Modelar `usuario_setores` (já mencionado em DB.md como pendência).
 *   - Aqui: substituir o ramo `else` por uma consulta a esses setores.
 *   - Documentar no `STACK.md` o helper `applySectorFilter(args, sectors)`
 *     que repositórios usarão.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { Request } from 'express';

import {
  SECTOR_FILTER_KEY,
  type SectorFilterMetadata,
} from '../decorators/filter-by-sector.decorator';
import { PermissionsCacheService } from '../cache/permissions-cache.service';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

@Injectable()
export class SectorFilterInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const meta = this.reflector.getAllAndOverride<SectorFilterMetadata>(
      SECTOR_FILTER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (meta === undefined) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (user === undefined) {
      // Sem user, RBAC já teria barrado. Aplica deny-by-default.
      request.sectorFilter = [];
      return next.handle();
    }

    const overrideAcao = `${meta.acaoBase}:all`;
    const allOverride = await this.resolveAllOverride(
      user.sub,
      meta.recurso,
      overrideAcao,
    );
    if (allOverride) {
      request.sectorFilter = null;
      return next.handle();
    }

    // TODO(Fase 3): buscar usuario_setores. Por enquanto, deny-by-default.
    request.sectorFilter = [];
    return next.handle();
  }

  private async resolveAllOverride(
    usuarioId: bigint,
    recurso: string,
    acao: string,
  ): Promise<boolean> {
    const cached = await this.cache.get(usuarioId, recurso, acao);
    if (cached !== undefined) {
      return cached;
    }
    const tx = this.prisma.tx();
    const hit = await tx.usuarioPerfil.findFirst({
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
    const allow = hit !== null;
    await this.cache.set(usuarioId, recurso, acao, allow);
    return allow;
  }
}
