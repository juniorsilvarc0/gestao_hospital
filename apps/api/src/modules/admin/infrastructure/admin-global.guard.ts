/**
 * `AdminGlobalGuard` — barreira EXCLUSIVA para endpoints `/v1/admin/*`.
 *
 * Critério de admissão (cumulativo):
 *   1. JWT já validado (rota não-public passa por `JwtAuthGuard` antes).
 *   2. `RequestContextStorage.get()` populado pelo `TenantContextInterceptor`.
 *   3. Usuário possui o perfil `ADMIN_GLOBAL` ativo (consulta no DB
 *      cross-tenant via `AdminRepository.isUserAdminGlobal`).
 *
 * Por que não usar só `@RequirePermission`?
 *   O `PermissionsGuard` consulta as permissões dentro do tenant ativo
 *   (RLS). Mesmo que `tenants_read` estivesse atribuído ao perfil
 *   ADMIN_GLOBAL no tenant raiz, um JWT cuja `tid` aponte para outro
 *   tenant veria o RLS filtrando os perfis e a checagem falharia
 *   incorretamente.
 *
 *   Esta guard valida diretamente — bypass de RLS — que o usuário
 *   possui o perfil global. Em conjunto com `@RequirePermission` no
 *   handler, ainda preserva a checagem fina (admin:tenants_read,
 *   admin:tenants_write, admin:security_view).
 *
 *   Ordem registrada via `@UseGuards(AdminGlobalGuard)` no controller:
 *   o Nest executa esta guard DEPOIS dos guards globais (JwtAuthGuard,
 *   PermissionsGuard) — se chegou aqui, já passou pela autenticação +
 *   RBAC. Esta apenas adiciona a barreira final cross-tenant.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminGlobalGuard implements CanActivate {
  private readonly logger = new Logger(AdminGlobalGuard.name);

  constructor(private readonly repo: AdminRepository) {}

  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new ForbiddenException({
        code: 'ADMIN_NOT_AUTHENTICATED',
        message: 'Contexto de requisição ausente.',
      });
    }
    const isGlobalAdmin = await this.repo.isUserAdminGlobal(ctx.userId);
    if (!isGlobalAdmin) {
      this.logger.warn(
        {
          correlationId: ctx.correlationId,
          userId: ctx.userId.toString(),
          tenantId: ctx.tenantId.toString(),
        },
        'admin.access_denied — usuário sem perfil ADMIN_GLOBAL',
      );
      throw new ForbiddenException({
        code: 'ADMIN_GLOBAL_REQUIRED',
        message:
          'Apenas usuários com perfil ADMIN_GLOBAL podem acessar este recurso.',
      });
    }
    return true;
  }
}
