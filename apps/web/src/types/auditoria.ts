/**
 * Tipos do módulo de Auditoria (Fase 13 — Trilha R-A).
 *
 * Espelha respostas de:
 *   GET /v1/auditoria/eventos
 *   GET /v1/auditoria/acessos-prontuario
 *   GET /v1/auditoria/security-events
 *
 * Os campos exatos dos diffs JSONB ficam soltos (`Record<string, unknown>`)
 * porque cada tabela auditada produz um shape diferente — o frontend só
 * renderiza o JSON pretty-printed.
 */

export interface AuditoriaEvento {
  uuid: string;
  tabela: string;
  registroId: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  finalidade?: string | null;
  usuarioUuid?: string | null;
  usuarioNome?: string | null;
  diff?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  ocorridoEm: string;
}

export interface PaginatedAuditoriaEventos {
  data: AuditoriaEvento[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListEventosParams {
  tabela?: string;
  finalidade?: string;
  usuarioUuid?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}

export interface AcessoProntuario {
  uuid: string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  usuarioUuid: string;
  usuarioNome?: string | null;
  finalidade: string;
  recurso?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  ocorridoEm: string;
}

export interface PaginatedAcessosProntuario {
  data: AcessoProntuario[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAcessosProntuarioParams {
  pacienteUuid?: string;
  usuarioUuid?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}

export const SECURITY_SEVERIDADES = [
  'INFO',
  'WARNING',
  'ALERTA',
  'CRITICO',
] as const;
export type SecuritySeveridade = (typeof SECURITY_SEVERIDADES)[number];

export const SECURITY_SEVERIDADE_LABEL: Record<SecuritySeveridade, string> = {
  INFO: 'Info',
  WARNING: 'Warning',
  ALERTA: 'Alerta',
  CRITICO: 'Crítico',
};

export const SECURITY_SEVERIDADE_BADGE: Record<SecuritySeveridade, string> = {
  INFO: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  WARNING: 'bg-amber-100 text-amber-900 border-amber-300',
  ALERTA: 'bg-orange-100 text-orange-900 border-orange-300',
  CRITICO: 'bg-red-100 text-red-900 border-red-300',
};

export interface SecurityEvent {
  uuid: string;
  tipo: string;
  severidade: SecuritySeveridade | string;
  tenantId?: string | null;
  usuarioUuid?: string | null;
  usuarioNome?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detalhes?: Record<string, unknown> | null;
  ocorridoEm: string;
}

export interface PaginatedSecurityEvents {
  data: SecurityEvent[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListSecurityEventsParams {
  tipo?: string;
  severidade?: SecuritySeveridade | string;
  tenantId?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}
