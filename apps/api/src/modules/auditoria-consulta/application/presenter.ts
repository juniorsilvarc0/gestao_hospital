/**
 * Presenters — converte rows brutas das tabelas de auditoria em DTOs
 * estáveis para o cliente HTTP.
 */
import type {
  AcessoRow,
  AuditEventoRow,
  SecurityEventRow,
} from '../infrastructure/auditoria-consulta.repository';
import type {
  AcessoProntuarioResponse,
  AuditEventoResponse,
  SecurityEventResponse,
} from '../dto/responses';

function toIso(d: Date): string {
  return d.toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function presentAuditEvento(row: AuditEventoRow): AuditEventoResponse {
  return {
    id: row.id.toString(),
    tabela: row.tabela,
    registroId: row.registro_id.toString(),
    operacao: row.operacao,
    diff: asObject(row.diff),
    usuarioUuid: row.usuario_uuid,
    finalidade: row.finalidade,
    correlationId: row.correlation_id,
    ip: row.ip,
    createdAt: toIso(row.created_at),
  };
}

export function presentAcesso(row: AcessoRow): AcessoProntuarioResponse {
  return {
    id: row.id.toString(),
    pacienteUuid: row.paciente_uuid,
    usuarioUuid: row.usuario_uuid,
    perfil: row.perfil,
    finalidade: row.finalidade,
    modulo: row.modulo,
    ip: row.ip,
    acessadoEm: toIso(row.acessado_em),
  };
}

export function presentSecurityEvent(
  row: SecurityEventRow,
): SecurityEventResponse {
  return {
    uuid: row.uuid_externo,
    tipo: row.tipo,
    severidade: row.severidade,
    usuarioUuid: row.usuario_uuid,
    alvoUsuarioUuid: row.alvo_usuario_uuid,
    ipOrigem: row.ip_origem,
    userAgent: row.user_agent,
    requestPath: row.request_path,
    requestMethod: row.request_method,
    detalhes: asObject(row.detalhes),
    createdAt: toIso(row.created_at),
  };
}
