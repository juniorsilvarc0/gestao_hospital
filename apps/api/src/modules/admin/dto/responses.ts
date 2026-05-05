/**
 * Tipos de resposta dos endpoints `/v1/admin/*`.
 */
export interface TenantResponse {
  uuid: string;
  codigo: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnes: string | null;
  registroAns: string | null;
  versaoTissPadrao: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface ListTenantsResponse {
  data: TenantResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SecurityEventResponse {
  uuid: string;
  tenantUuid: string | null;
  tipo: string;
  severidade: string;
  usuarioUuid: string | null;
  alvoUsuarioUuid: string | null;
  ipOrigem: string | null;
  userAgent: string | null;
  requestPath: string | null;
  requestMethod: string | null;
  detalhes: Record<string, unknown>;
  createdAt: string;
}

export interface ListSecurityEventsResponse {
  data: SecurityEventResponse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SecurityDashboardCounter {
  tipo: string;
  count: number;
}

export interface SecurityDashboardSeverityCounter {
  severidade: string;
  count: number;
}

export interface SecurityDashboardTenantCounter {
  tenantUuid: string | null;
  tenantCodigo: string | null;
  count: number;
}

export interface SecurityDashboardIpCounter {
  ip: string;
  qtdEventos: number;
  tiposBloqueio: string[];
}

export interface SecurityDashboardSeveridadeBreakdown {
  CRITICO: number;
  ALERTA: number;
  WARNING: number;
  INFO: number;
}

export interface SecurityDashboardResponse {
  /**
   * @deprecated mantido para compatibilidade com clientes da Fase 12.
   * Prefira `periodo`.
   */
  janela: {
    dias: number;
    inicio: string;
    fim: string;
  };
  periodo: {
    dias: number;
    inicio: string;
    fim: string;
  };
  totalEventos: number;
  porSeveridade: SecurityDashboardSeveridadeBreakdown;
  porTipo: SecurityDashboardCounter[];
  topIps: SecurityDashboardIpCounter[];
  ultimosCriticos: SecurityEventResponse[];
  porTenant: Array<{
    tenantUuid: string | null;
    tenantCodigo: string | null;
    tenantNome: string | null;
    qtd: number;
  }>;
}
