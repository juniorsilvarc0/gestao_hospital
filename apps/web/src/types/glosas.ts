/**
 * Tipos do módulo Glosas (Fase 8 — Trilha C da API).
 *
 * Espelha os DTOs de resposta de
 * `apps/api/src/modules/glosas/dto/responses.ts`.
 */

export const GLOSA_STATUSES = [
  'RECEBIDA',
  'EM_ANALISE',
  'EM_RECURSO',
  'REVERTIDA',
  'ACATADA',
  'PERDA_DEFINITIVA',
] as const;
export type GlosaStatus = (typeof GLOSA_STATUSES)[number];

export const GLOSA_STATUS_LABEL: Record<GlosaStatus, string> = {
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em análise',
  EM_RECURSO: 'Em recurso',
  REVERTIDA: 'Revertida',
  ACATADA: 'Acatada',
  PERDA_DEFINITIVA: 'Perda definitiva',
};

export const GLOSA_STATUS_BADGE: Record<GlosaStatus, string> = {
  RECEBIDA: 'bg-amber-100 text-amber-900 border-amber-300',
  EM_ANALISE: 'bg-blue-100 text-blue-900 border-blue-300',
  EM_RECURSO: 'bg-purple-100 text-purple-900 border-purple-300',
  REVERTIDA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  ACATADA: 'bg-zinc-200 text-zinc-900 border-zinc-400',
  PERDA_DEFINITIVA: 'bg-red-100 text-red-900 border-red-300',
};

export const GLOSA_ORIGENS = ['TISS', 'MANUAL', 'IMPORTACAO'] as const;
export type GlosaOrigem = (typeof GLOSA_ORIGENS)[number];

export const GLOSA_ORIGEM_LABEL: Record<GlosaOrigem, string> = {
  TISS: 'TISS (retorno operadora)',
  MANUAL: 'Manual',
  IMPORTACAO: 'Importação',
};

export interface Glosa {
  uuid: string;
  contaUuid: string;
  contaNumero: string;
  contaItemUuid: string | null;
  contaItemDescricao?: string | null;
  guiaTissUuid: string | null;
  guiaTissNumero?: string | null;
  motivo: string;
  codigoGlosaTiss: string | null;
  valorGlosado: string;
  valorRevertido: string;
  dataGlosa: string;
  prazoRecurso: string;
  status: GlosaStatus;
  origem: GlosaOrigem;
  recurso: string | null;
  recursoDocumentoUrl: string | null;
  dataRecurso: string | null;
  motivoResposta: string | null;
  dataRespostaRecurso: string | null;
  convenioUuid: string;
  convenioNome?: string | null;
  pacienteNome?: string | null;
  createdAt: string;
}

export interface ListGlosasParams {
  status?: GlosaStatus | GlosaStatus[];
  convenioUuid?: string;
  dataInicio?: string;
  dataFim?: string;
  contaUuid?: string;
  origem?: GlosaOrigem;
  prazoVencido?: 'D7' | 'D3' | 'D0' | 'VENCIDO';
  page?: number;
  pageSize?: number;
}

export interface PaginatedGlosas {
  data: Glosa[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateGlosaManualInput {
  contaUuid: string;
  contaItemUuid?: string;
  guiaTissUuid?: string;
  motivo: string;
  codigoGlosaTiss?: string;
  valorGlosado: number;
  dataGlosa: string;
  prazoRecurso: string;
}

export interface ImportarGlosasTissInput {
  glosas: Array<{
    contaUuid?: string;
    contaNumero?: string;
    guiaTissNumeroOperadora?: string;
    motivo: string;
    codigoGlosaTiss: string;
    valorGlosado: number;
    dataGlosa: string;
    prazoRecurso: string;
  }>;
}

export interface ImportarGlosasResult {
  total: number;
  importadas: number;
  comAlerta: number;
  alertas: Array<{ linha: number; mensagem: string }>;
}

export interface CadastrarRecursoInput {
  recurso: string;
  recursoDocumentoUrl?: string;
  dataRecurso?: string;
}

export interface FinalizarGlosaInput {
  status: 'REVERTIDA' | 'ACATADA' | 'PERDA_DEFINITIVA';
  valorRevertido?: number;
  motivoResposta?: string;
}

export interface GlosasDashboard {
  totalRecebidas: number;
  totalEmRecurso: number;
  totalRevertidas: number;
  totalAcatadas: number;
  totalPerdaDefinitiva: number;
  valorTotalGlosado: string;
  valorTotalRevertido: string;
  taxaReversao: string;
  prazos: {
    d7: number;
    d3: number;
    d0: number;
    vencido: number;
  };
}
