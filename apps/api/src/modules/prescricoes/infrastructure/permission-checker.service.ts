/**
 * `PermissionChecker` — verificação ad-hoc de permissão dentro de um
 * use case.
 *
 * Por que não usar o `PermissionsGuard`? O guard só roda 1x por
 * endpoint (decorator único). Aqui precisamos de checagem **condicional**
 * — só exigir `prescricoes:override-alergia` quando `body.overrides.
 * alergia` está presente, por exemplo. Replicar o decorator inflaria a
 * matriz de endpoints; mais simples checar ad-hoc.
 *
 * Reusa `PermissionsCacheService` (cache global Redis/memory) para que
 * a verificação seja barata (≤1ms quente).
 */
import { Injectable } from '@nestjs/common';

import { PermissionsCacheService } from '../../../common/cache/permissions-cache.service';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

@Injectable()
export class PermissionChecker {
  constructor(
    private readonly cache: PermissionsCacheService,
    private readonly prisma: PrismaService,
  ) {}

  async hasPermission(
    usuarioId: bigint,
    recurso: string,
    acao: string,
  ): Promise<boolean> {
    const cached = await this.cache.get(usuarioId, recurso, acao);
    if (cached !== undefined) return cached;
    // Estamos dentro do request-scope (TenantContextInterceptor já abriu
    // a transação com SET LOCAL app.current_tenant_id) — `prisma.tx()`
    // devolve esse cliente, não precisamos abrir nova transação.
    const tx = this.prisma.tx();
    const found = await tx.usuarioPerfil.findFirst({
      where: {
        usuarioId,
        perfil: {
          ativo: true,
          permissoes: { some: { permissao: { recurso, acao } } },
        },
      },
      select: { perfilId: true },
    });
    const allow = found !== null;
    await this.cache.set(usuarioId, recurso, acao, allow);
    return allow;
  }
}
