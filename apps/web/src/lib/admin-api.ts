/**
 * Wrappers tipados para os endpoints de Admin global / Security cross-tenant
 * (Fase 13 — R-B).
 *
 *   GET   /v1/admin/tenants
 *   GET   /v1/admin/tenants/:uuid
 *   POST  /v1/admin/tenants
 *   PATCH /v1/admin/tenants/:uuid
 *   POST  /v1/admin/tenants/:uuid/ativar
 *   POST  /v1/admin/tenants/:uuid/desativar
 *   GET   /v1/admin/security/events
 *   GET   /v1/admin/security/dashboard?dias=30
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  AtualizarTenantInput,
  CriarTenantInput,
  ListTenantsParams,
  PaginatedTenants,
  SecurityDashboard,
  SecurityDashboardParams,
  Tenant,
} from '@/types/admin';
import type {
  ListSecurityEventsParams,
  PaginatedSecurityEvents,
} from '@/types/auditoria';

interface Envelope<T> {
  data: T;
}

/**
 * Desempacota envelopes do tipo `{ data: T }` produzidos pelo NestJS interceptor
 * padrão. **Não** desempacota respostas paginadas — quando o payload já contém
 * tanto `data` quanto `meta`, ele já é o tipo final que o frontend espera.
 */
function unwrap<T>(response: T | Envelope<T>): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'data' in (response as object) &&
    !('meta' in (response as object)) &&
    Object.keys(response as object).length === 1
  ) {
    return (response as Envelope<T>).data;
  }
  return response as T;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.set(key, String(value));
    }
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

/* ============================== Tenants ============================== */

export async function listTenants(
  params: ListTenantsParams = {},
): Promise<PaginatedTenants> {
  const response = await apiGet<PaginatedTenants | Envelope<PaginatedTenants>>(
    `/admin/tenants${buildQuery(params)}`,
  );
  return unwrap(response);
}

export async function getTenant(uuid: string): Promise<Tenant> {
  const response = await apiGet<Tenant | Envelope<Tenant>>(
    `/admin/tenants/${uuid}`,
  );
  return unwrap(response);
}

export async function criarTenant(input: CriarTenantInput): Promise<Tenant> {
  const response = await apiPost<Tenant | Envelope<Tenant>>(
    `/admin/tenants`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function atualizarTenant(
  uuid: string,
  input: AtualizarTenantInput,
): Promise<Tenant> {
  const response = await apiPatch<Tenant | Envelope<Tenant>>(
    `/admin/tenants/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function ativarTenant(uuid: string): Promise<Tenant> {
  const response = await apiPost<Tenant | Envelope<Tenant>>(
    `/admin/tenants/${uuid}/ativar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function desativarTenant(uuid: string): Promise<Tenant> {
  const response = await apiPost<Tenant | Envelope<Tenant>>(
    `/admin/tenants/${uuid}/desativar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

/* ============================== Security ============================== */

export async function listSecurityEventsAdmin(
  params: ListSecurityEventsParams = {},
): Promise<PaginatedSecurityEvents> {
  const response = await apiGet<
    PaginatedSecurityEvents | Envelope<PaginatedSecurityEvents>
  >(`/admin/security/events${buildQuery(params)}`);
  return unwrap(response);
}

export async function getSecurityDashboard(
  params: SecurityDashboardParams = {},
): Promise<SecurityDashboard> {
  const response = await apiGet<
    SecurityDashboard | Envelope<SecurityDashboard>
  >(`/admin/security/dashboard${buildQuery(params)}`);
  return unwrap(response);
}
