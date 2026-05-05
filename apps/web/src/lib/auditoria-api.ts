/**
 * Wrappers tipados para os endpoints de Auditoria (Fase 13 — R-A).
 *
 *   GET /v1/auditoria/eventos?tabela=&finalidade=&usuarioUuid=&dataInicio=&dataFim=&page=
 *   GET /v1/auditoria/acessos-prontuario?pacienteUuid=&usuarioUuid=&dataInicio=&dataFim=&page=
 *   GET /v1/auditoria/security-events?tipo=&severidade=&dataInicio=&dataFim=&page=
 */
import { apiGet } from '@/lib/api-client';
import type {
  ListAcessosProntuarioParams,
  ListEventosParams,
  ListSecurityEventsParams,
  PaginatedAcessosProntuario,
  PaginatedAuditoriaEventos,
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

export async function listEventos(
  params: ListEventosParams = {},
): Promise<PaginatedAuditoriaEventos> {
  const response = await apiGet<
    PaginatedAuditoriaEventos | Envelope<PaginatedAuditoriaEventos>
  >(`/auditoria/eventos${buildQuery(params)}`);
  return unwrap(response);
}

export async function listAcessosProntuario(
  params: ListAcessosProntuarioParams = {},
): Promise<PaginatedAcessosProntuario> {
  const response = await apiGet<
    PaginatedAcessosProntuario | Envelope<PaginatedAcessosProntuario>
  >(`/auditoria/acessos-prontuario${buildQuery(params)}`);
  return unwrap(response);
}

export async function listSecurityEvents(
  params: ListSecurityEventsParams = {},
): Promise<PaginatedSecurityEvents> {
  const response = await apiGet<
    PaginatedSecurityEvents | Envelope<PaginatedSecurityEvents>
  >(`/auditoria/security-events${buildQuery(params)}`);
  return unwrap(response);
}
