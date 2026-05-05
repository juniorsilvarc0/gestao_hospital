/**
 * Tipos do módulo Admin global / Security cross-tenant (Fase 13 — Trilha R-B).
 *
 * Endpoints:
 *   GET  /v1/admin/tenants
 *   GET  /v1/admin/tenants/:uuid
 *   POST /v1/admin/tenants
 *   PATCH /v1/admin/tenants/:uuid
 *   POST /v1/admin/tenants/:uuid/ativar
 *   POST /v1/admin/tenants/:uuid/desativar
 *   GET  /v1/admin/security/events
 *   GET  /v1/admin/security/dashboard?dias=30
 *   POST /v1/security/icp-brasil/validar
 */
import type {
  PaginatedSecurityEvents,
  ListSecurityEventsParams,
} from '@/types/auditoria';

export const TENANT_STATUSES = ['ATIVO', 'INATIVO'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
};

export const TENANT_STATUS_BADGE: Record<TenantStatus, string> = {
  ATIVO: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  INATIVO: 'bg-zinc-200 text-zinc-900 border-zinc-400',
};

export interface Tenant {
  uuid: string;
  codigo: string;
  nome: string;
  cnpj?: string | null;
  status: TenantStatus | string;
  /** Quantidade de usuários ativos (snapshot). */
  usuariosAtivos?: number | null;
  /** Quantidade de pacientes ativos (snapshot). */
  pacientesAtivos?: number | null;
  criadoEm: string;
  ativadoEm?: string | null;
  desativadoEm?: string | null;
}

export interface PaginatedTenants {
  data: Tenant[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListTenantsParams {
  status?: TenantStatus | string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CriarTenantInput {
  codigo: string;
  nome: string;
  cnpj?: string;
}

export interface AtualizarTenantInput {
  nome?: string;
  cnpj?: string;
}

/* ===================== Security Dashboard ===================== */

export interface SecurityDashboardResumo {
  totalEventos: number;
  porSeveridade: {
    INFO: number;
    WARNING: number;
    ALERTA: number;
    CRITICO: number;
  };
}

export interface SecurityDashboardTipoTop {
  tipo: string;
  qtd: number;
}

export interface SecurityDashboardIpBloqueado {
  ip: string;
  qtdBloqueios: number;
  ultimaOcorrencia: string;
}

export interface SecurityDashboardEventoRecente {
  uuid: string;
  tipo: string;
  severidade: string;
  ip?: string | null;
  usuarioNome?: string | null;
  ocorridoEm: string;
}

export interface SecurityDashboard {
  dias: number;
  resumo: SecurityDashboardResumo;
  topTipos: SecurityDashboardTipoTop[];
  ipsTopBloqueios: SecurityDashboardIpBloqueado[];
  eventosRecentes: SecurityDashboardEventoRecente[];
}

export interface SecurityDashboardParams {
  dias?: number;
}

/* ===================== ICP-Brasil ===================== */

export interface IcpBrasilValidacaoInput {
  /** Certificado em base64 (DER ou PEM sem header — backend decodifica). */
  certData: string;
}

export interface IcpBrasilValidacaoResult {
  valid: boolean;
  reason?: string | null;
  /** Subject do certificado quando válido. */
  subject?: string | null;
  /** Issuer (AC). */
  issuer?: string | null;
  /** Notação ISO da data de expiração quando disponível. */
  validoAte?: string | null;
}

export type {
  PaginatedSecurityEvents as PaginatedAdminSecurityEvents,
  ListSecurityEventsParams as ListAdminSecurityEventsParams,
};
