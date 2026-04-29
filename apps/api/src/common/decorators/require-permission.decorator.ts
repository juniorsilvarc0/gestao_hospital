/**
 * `@RequirePermission(recurso, acao)` — exige uma permissão granular
 * para o handler. Avaliada por `PermissionsGuard` (global).
 *
 * Regras:
 *   - Toda permissão é a tupla (recurso, acao). Ex.:
 *       @RequirePermission('users', 'read')
 *       @RequirePermission('pacientes', 'write')
 *   - Para liberar listagem global de um recurso (override ABAC), use
 *     a ação `<acao>:all`. Ex.: 'pacientes:read:all' bypassa o filtro
 *     por setor (ver §5 SKILL.md). NÃO o use sem necessidade.
 *   - Métodos `@Public()` não chegam neste guard.
 *   - Múltiplos decorators NÃO se acumulam: o último vence (nest behavior
 *     com `SetMetadata`). Para "e/ou" entre permissões, use os helpers
 *     `RequireAllPermissions` / `RequireAnyPermission` (extensões
 *     futuras — Trilha C entrega só o caminho 1:1).
 */
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requirePermissions';

export interface RequiredPermission {
  recurso: string;
  acao: string;
}

export const RequirePermission = (
  recurso: string,
  acao: string,
): MethodDecorator & ClassDecorator =>
  SetMetadata<string, RequiredPermission>(PERMISSIONS_KEY, { recurso, acao });
