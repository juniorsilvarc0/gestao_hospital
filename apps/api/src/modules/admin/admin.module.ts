/**
 * Bounded Context: Admin Global (cross-tenant) — Fase 13 / Trilha R-B.
 *
 * Endpoints:
 *   /v1/admin/tenants/*
 *   /v1/admin/security/{events,dashboard}
 *
 * Pré-requisitos:
 *   - Migration `20260505031110_hardening_lgpd_admin` aplicada (cria
 *     tabela `audit_security_events`, perfil `ADMIN_GLOBAL` no tenant 1
 *     e permissões `admin:tenants_read|tenants_write|security_view`).
 *   - `AuditoriaModule` (Global) para registrar eventos.
 *
 * Atenção: `AdminRepository` faz `SET LOCAL row_security = OFF` em
 * suas queries — o role do Prisma precisa ter `BYPASSRLS`. Em
 * produção, o role da aplicação NÃO deve ter BYPASSRLS por padrão
 * (princípio do menor privilégio) — recomendação Phase 13+ é separar
 * em duas conexões distintas (admin-prisma vs app-prisma) ou usar
 * `SECURITY DEFINER` em uma função SQL dedicada.
 */
import { Module } from '@nestjs/common';

// ─── Tenants (use cases) ───
import { AtivarTenantUseCase } from './application/tenants/ativar-tenant.use-case';
import { CreateTenantUseCase } from './application/tenants/create-tenant.use-case';
import { DesativarTenantUseCase } from './application/tenants/desativar-tenant.use-case';
import { GetTenantUseCase } from './application/tenants/get-tenant.use-case';
import { ListTenantsUseCase } from './application/tenants/list-tenants.use-case';
import { UpdateTenantUseCase } from './application/tenants/update-tenant.use-case';
// ─── Security (use cases) ───
import { GetSecurityDashboardUseCase } from './application/security/get-security-dashboard.use-case';
import { ListSecurityEventsUseCase } from './application/security/list-security-events.use-case';
// ─── Infra ───
import { AdminGlobalGuard } from './infrastructure/admin-global.guard';
import { AdminRepository } from './infrastructure/admin.repository';
import { SecurityController } from './infrastructure/controllers/security.controller';
import { TenantsController } from './infrastructure/controllers/tenants.controller';

@Module({
  controllers: [TenantsController, SecurityController],
  providers: [
    AdminRepository,
    AdminGlobalGuard,
    // Tenants
    ListTenantsUseCase,
    GetTenantUseCase,
    CreateTenantUseCase,
    UpdateTenantUseCase,
    AtivarTenantUseCase,
    DesativarTenantUseCase,
    // Security
    ListSecurityEventsUseCase,
    GetSecurityDashboardUseCase,
  ],
  exports: [AdminRepository],
})
export class AdminModule {}
