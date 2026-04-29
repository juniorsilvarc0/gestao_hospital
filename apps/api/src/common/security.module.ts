/**
 * `SecurityModule` — agrupa as peças de identidade transversais
 * (cache de permissões, guards, interceptors). Marcado `@Global()`
 * porque os providers (especialmente `PermissionsCacheService`)
 * precisam ser únicos no processo.
 *
 * O AppModule registra os guards/interceptor como APP_GUARD/APP_INTERCEPTOR.
 */
import { Global, Module } from '@nestjs/common';

import { PermissionsCacheService } from './cache/permissions-cache.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { TenantContextInterceptor } from './interceptors/tenant-context.interceptor';
import { SectorFilterInterceptor } from './interceptors/sector-filter.interceptor';

@Global()
@Module({
  providers: [
    PermissionsCacheService,
    JwtAuthGuard,
    PermissionsGuard,
    TenantContextInterceptor,
    SectorFilterInterceptor,
  ],
  exports: [
    PermissionsCacheService,
    JwtAuthGuard,
    PermissionsGuard,
    TenantContextInterceptor,
    SectorFilterInterceptor,
  ],
})
export class SecurityModule {}
