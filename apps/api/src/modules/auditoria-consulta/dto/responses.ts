/**
 * DTOs de resposta — leituras de auditoria.
 */
import type { AuditOperacao } from './list-eventos-query.dto';
import type {
  SecurityEventSeveridade,
  SecurityEventTipo,
} from './list-security-query.dto';

export interface AuditEventoResponse {
  id: string;
  tabela: string;
  registroId: string;
  operacao: AuditOperacao;
  diff: Record<string, unknown>;
  usuarioUuid: string | null;
  finalidade: string | null;
  correlationId: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AcessoProntuarioResponse {
  id: string;
  pacienteUuid: string;
  usuarioUuid: string;
  perfil: string;
  finalidade: string;
  modulo: string;
  ip: string | null;
  acessadoEm: string;
}

export interface SecurityEventResponse {
  uuid: string;
  tipo: SecurityEventTipo;
  severidade: SecurityEventSeveridade;
  usuarioUuid: string | null;
  alvoUsuarioUuid: string | null;
  ipOrigem: string | null;
  userAgent: string | null;
  requestPath: string | null;
  requestMethod: string | null;
  detalhes: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListEventosResponse {
  data: AuditEventoResponse[];
  meta: PaginatedMeta;
}

export interface ListAcessosResponse {
  data: AcessoProntuarioResponse[];
  meta: PaginatedMeta;
}

export interface ListSecurityResponse {
  data: SecurityEventResponse[];
  meta: PaginatedMeta;
}
