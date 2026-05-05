/**
 * Presenter — converte rows de `audit_security_events` em DTOs públicos
 * dos endpoints `/v1/admin/security/*`.
 */
import type { SecurityEventRow } from '../../infrastructure/admin.repository';
import type { SecurityEventResponse } from '../../dto/responses';

function toIso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function presentSecurityEvent(
  row: SecurityEventRow,
): SecurityEventResponse {
  return {
    uuid: row.uuid_externo,
    tenantUuid: row.tenant_uuid,
    tipo: row.tipo,
    severidade: row.severidade,
    usuarioUuid: row.usuario_uuid,
    alvoUsuarioUuid: row.alvo_usuario_uuid,
    ipOrigem: row.ip_origem,
    userAgent: row.user_agent,
    requestPath: row.request_path,
    requestMethod: row.request_method,
    detalhes: row.detalhes ?? {},
    createdAt: toIso(row.created_at) ?? '',
  };
}
