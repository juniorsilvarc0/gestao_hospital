/**
 * Tipos do módulo Contas / Faturamento (Fase 8 — Trilha A da API).
 *
 * Espelha os DTOs de resposta de
 * `apps/api/src/modules/faturamento/dto/responses.ts` (a serem implementados
 * na Trilha A — frontend assume contrato fixado neste arquivo).
 *
 * Convenções:
 *  - Valores monetários vêm como strings (DECIMAL preserva precisão).
 *  - Datas/timestamps em ISO-8601.
 */

export const CONTA_STATUSES = [
  'ABERTA',
  'EM_ELABORACAO',
  'FECHADA',
  'FATURADA',
  'GLOSADA_PARCIAL',
  'GLOSADA_TOTAL',
  'PAGA',
  'CANCELADA',
] as const;
export type ContaStatus = (typeof CONTA_STATUSES)[number];

export const CONTA_STATUS_LABEL: Record<ContaStatus, string> = {
  ABERTA: 'Aberta',
  EM_ELABORACAO: 'Em elaboração',
  FECHADA: 'Fechada',
  FATURADA: 'Faturada',
  GLOSADA_PARCIAL: 'Glosada parcial',
  GLOSADA_TOTAL: 'Glosada total',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export const CONTA_STATUS_BADGE: Record<ContaStatus, string> = {
  ABERTA: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  EM_ELABORACAO: 'bg-blue-100 text-blue-900 border-blue-300',
  FECHADA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  FATURADA: 'bg-purple-100 text-purple-900 border-purple-300',
  GLOSADA_PARCIAL: 'bg-orange-100 text-orange-900 border-orange-300',
  GLOSADA_TOTAL: 'bg-orange-200 text-orange-950 border-orange-400',
  PAGA: 'bg-emerald-200 text-emerald-950 border-emerald-500',
  CANCELADA: 'bg-red-100 text-red-900 border-red-300',
};

export const GRUPOS_GASTO = [
  'PROCEDIMENTOS',
  'DIARIAS',
  'TAXAS',
  'SERVICOS',
  'MATERIAIS',
  'MEDICAMENTOS',
  'OPME',
  'GASES',
  'PACOTES',
  'HONORARIOS',
] as const;
export type GrupoGasto = (typeof GRUPOS_GASTO)[number];

export const GRUPO_GASTO_LABEL: Record<GrupoGasto, string> = {
  PROCEDIMENTOS: 'Procedimentos',
  DIARIAS: 'Diárias',
  TAXAS: 'Taxas',
  SERVICOS: 'Serviços',
  MATERIAIS: 'Materiais',
  MEDICAMENTOS: 'Medicamentos',
  OPME: 'OPME',
  GASES: 'Gases',
  PACOTES: 'Pacotes',
  HONORARIOS: 'Honorários',
};

export interface ContaResumo {
  uuid: string;
  numero: string;
  pacienteUuid: string;
  pacienteNome: string;
  atendimentoUuid: string;
  atendimentoNumero: string;
  convenioUuid: string;
  convenioNome: string;
  valorTotal: string;
  valorLiquido: string;
  status: ContaStatus;
  dataAbertura: string;
  dataFechamento: string | null;
}

export interface ContaItem {
  uuid: string;
  procedimentoUuid: string;
  procedimentoCodigo: string | null;
  procedimentoNome: string;
  grupoGasto: GrupoGasto;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  origem: 'PRESCRICAO' | 'CIRURGIA' | 'DISPENSACAO' | 'AUTOMATICO' | 'MANUAL';
  prestadorExecutanteUuid: string | null;
  prestadorExecutanteNome: string | null;
  setorUuid: string | null;
  dataRealizacao: string | null;
  pacote: boolean;
  foraPacote: boolean;
  loteOpme: string | null;
  validadeOpme: string | null;
  anvisaOpme: string | null;
  fabricanteOpme: string | null;
  autorizacaoNumero: string | null;
  motivoLancamento: string | null;
}

export interface ContaInconsistencia {
  severidade: 'ERROR' | 'WARNING' | 'INFO';
  codigo: string;
  mensagem: string;
  itemUuid: string | null;
  campo: string | null;
}

export interface ContaSnapshots {
  tabelaPrecosSnap: unknown;
  condicaoContratualSnap: unknown;
  versaoTissSnapshot: string | null;
  iss: {
    aliquota: string;
    valor: string;
    retem: boolean;
  } | null;
}

export interface ContaResumoValores {
  procedimentos: string;
  diarias: string;
  taxas: string;
  servicos: string;
  materiais: string;
  medicamentos: string;
  opme: string;
  gases: string;
  pacotes: string;
  honorarios: string;
  total: string;
  glosa: string;
  recursoRevertido: string;
  liquido: string;
}

export interface ContaDetalhe {
  uuid: string;
  numero: string;
  pacienteUuid: string;
  pacienteNome: string;
  atendimentoUuid: string;
  atendimentoNumero: string;
  convenioUuid: string;
  convenioNome: string;
  status: ContaStatus;
  dataAbertura: string;
  dataFechamento: string | null;
  motivoCancelamento: string | null;
  motivoReabertura: string | null;
  resumo: ContaResumoValores;
  itens: ContaItem[];
  inconsistencias: ContaInconsistencia[];
  snapshots: ContaSnapshots;
  glosaUuids: string[];
  guiaTissUuids: string[];
  loteTissUuids: string[];
}

export interface ListContasParams {
  status?: ContaStatus | ContaStatus[];
  convenioUuid?: string;
  dataAbertura?: string;
  dataAberturaFim?: string;
  numero?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedContas {
  data: ContaResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface LancarItemContaInput {
  procedimentoUuid: string;
  grupoGasto: GrupoGasto;
  quantidade: number;
  valorUnitario: number;
  motivo: string;
  prestadorExecutanteUuid?: string;
  setorUuid?: string;
  dataRealizacao?: string;
  pacote?: boolean;
  foraPacote?: boolean;
  loteOpme?: string;
  validadeOpme?: string;
  anvisaOpme?: string;
  fabricanteOpme?: string;
  autorizacaoNumero?: string;
}

export interface ElaborarContaResult {
  conta: ContaDetalhe;
  inconsistencias: ContaInconsistencia[];
  operacaoUuid: string;
}

export interface RecalcularContaInput {
  operacaoUuid: string;
}

export interface ReabrirContaInput {
  motivo: string;
}

export interface CancelarContaInput {
  motivo: string;
}

/* ---------------- Pacotes ---------------- */

export interface PacoteItem {
  procedimentoUuid: string;
  procedimentoNome?: string | null;
  quantidade: number;
  faixaInicio?: number | null;
  faixaFim?: number | null;
}

export interface Pacote {
  uuid: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  procedimentoPrincipalUuid: string;
  procedimentoPrincipalNome?: string | null;
  convenioUuid: string;
  convenioNome?: string | null;
  valorTotal: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  itens: PacoteItem[];
  ativo: boolean;
  createdAt: string;
}

export interface PaginatedPacotes {
  data: Pacote[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreatePacoteInput {
  codigo: string;
  nome: string;
  descricao?: string;
  procedimentoPrincipalUuid: string;
  convenioUuid: string;
  valorTotal: number;
  vigenciaInicio: string;
  vigenciaFim?: string;
  itens: PacoteItem[];
}

export type UpdatePacoteInput = Partial<CreatePacoteInput>;
