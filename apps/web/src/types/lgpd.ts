/**
 * Tipos do módulo LGPD (Fase 13 — Trilha R-A).
 *
 * Solicitações de titular (RN-LGP-01..04):
 *   - acesso       — relatório de dados pessoais.
 *   - correcao     — atualização de dados.
 *   - exclusao     — exclusão (soft + bloqueio para tratamento futuro).
 *   - portabilidade — export FHIR para outro responsável de tratamento.
 *
 * Exports internos (LGPD-Export):
 *   - dual approval: DPO + Supervisor (RN-LGP-04). Quem é DPO não pode
 *     ser também o Supervisor de uma mesma solicitação.
 *
 * Endpoints:
 *   POST /v1/lgpd/solicitacoes/{tipo}
 *   GET  /v1/lgpd/solicitacoes/me
 *   GET  /v1/lgpd/solicitacoes
 *   POST /v1/lgpd/exports
 *   GET  /v1/lgpd/exports
 *   GET  /v1/lgpd/exports/:uuid
 *   POST /v1/lgpd/exports/:uuid/aprovar-dpo
 *   POST /v1/lgpd/exports/:uuid/aprovar-supervisor
 *   POST /v1/lgpd/exports/:uuid/rejeitar
 *   POST /v1/lgpd/exports/:uuid/gerar
 *   GET  /v1/lgpd/exportacao/:uuid       (download FHIR Bundle)
 */

export const LGPD_SOLICITACAO_TIPOS = [
  'acesso',
  'correcao',
  'exclusao',
  'portabilidade',
] as const;
export type LgpdSolicitacaoTipo = (typeof LGPD_SOLICITACAO_TIPOS)[number];

export const LGPD_SOLICITACAO_TIPO_LABEL: Record<LgpdSolicitacaoTipo, string> = {
  acesso: 'Acesso a dados',
  correcao: 'Correção de dados',
  exclusao: 'Exclusão de dados',
  portabilidade: 'Portabilidade (FHIR)',
};

export const LGPD_SOLICITACAO_STATUSES = [
  'PENDENTE',
  'EM_ANALISE',
  'ATENDIDA',
  'REJEITADA',
] as const;
export type LgpdSolicitacaoStatus = (typeof LGPD_SOLICITACAO_STATUSES)[number];

export const LGPD_SOLICITACAO_STATUS_LABEL: Record<LgpdSolicitacaoStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em análise',
  ATENDIDA: 'Atendida',
  REJEITADA: 'Rejeitada',
};

export const LGPD_SOLICITACAO_STATUS_BADGE: Record<LgpdSolicitacaoStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-900 border-amber-300',
  EM_ANALISE: 'bg-blue-100 text-blue-900 border-blue-300',
  ATENDIDA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  REJEITADA: 'bg-red-100 text-red-900 border-red-300',
};

export interface LgpdSolicitacao {
  uuid: string;
  tipo: LgpdSolicitacaoTipo | string;
  status: LgpdSolicitacaoStatus | string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  motivo?: string | null;
  detalhes?: Record<string, unknown> | null;
  resposta?: string | null;
  abertaEm: string;
  atendidaEm?: string | null;
  atendidaPor?: string | null;
}

export interface PaginatedLgpdSolicitacoes {
  data: LgpdSolicitacao[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListSolicitacoesParams {
  tipo?: LgpdSolicitacaoTipo | string;
  status?: LgpdSolicitacaoStatus | string;
  pacienteUuid?: string;
  page?: number;
  pageSize?: number;
}

/* ============================== Exports ============================== */

export const LGPD_EXPORT_STATUSES = [
  'PENDENTE',
  'APROVADO_DPO',
  'APROVADO_SUPERVISOR',
  'PRONTO',
  'GERADO',
  'REJEITADO',
] as const;
export type LgpdExportStatus = (typeof LGPD_EXPORT_STATUSES)[number];

export const LGPD_EXPORT_STATUS_LABEL: Record<LgpdExportStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADO_DPO: 'Aprovado pelo DPO',
  APROVADO_SUPERVISOR: 'Aprovado pelo Supervisor',
  PRONTO: 'Pronto para gerar',
  GERADO: 'Gerado (download disponível)',
  REJEITADO: 'Rejeitado',
};

export const LGPD_EXPORT_STATUS_BADGE: Record<LgpdExportStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-900 border-amber-300',
  APROVADO_DPO: 'bg-blue-100 text-blue-900 border-blue-300',
  APROVADO_SUPERVISOR: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  PRONTO: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  GERADO: 'bg-emerald-100 text-emerald-900 border-emerald-400',
  REJEITADO: 'bg-red-100 text-red-900 border-red-300',
};

export interface LgpdExport {
  uuid: string;
  status: LgpdExportStatus | string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  finalidade: string;
  motivo?: string | null;
  /** UUID do usuário que aprovou como DPO (caso aprovado). */
  aprovadorDpoUuid?: string | null;
  aprovadorDpoNome?: string | null;
  aprovadoDpoEm?: string | null;
  /** UUID do usuário que aprovou como Supervisor (caso aprovado). */
  aprovadorSupervisorUuid?: string | null;
  aprovadorSupervisorNome?: string | null;
  aprovadoSupervisorEm?: string | null;
  rejeitadoPorUuid?: string | null;
  rejeitadoPorNome?: string | null;
  rejeitadoEm?: string | null;
  motivoRejeicao?: string | null;
  geradoEm?: string | null;
  /** URL relativa de download (`/v1/lgpd/exportacao/:uuid`). */
  downloadUrl?: string | null;
  criadoEm: string;
  criadoPorUuid?: string | null;
  criadoPorNome?: string | null;
}

export interface PaginatedLgpdExports {
  data: LgpdExport[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListExportsParams {
  status?: LgpdExportStatus | string;
  pacienteUuid?: string;
  page?: number;
  pageSize?: number;
}

export interface CriarExportInput {
  pacienteUuid: string;
  finalidade: string;
  motivo?: string;
}

export interface RejeitarExportInput {
  motivo: string;
}

export interface CriarSolicitacaoInput {
  pacienteUuid?: string;
  motivo?: string;
  detalhes?: Record<string, unknown>;
}
