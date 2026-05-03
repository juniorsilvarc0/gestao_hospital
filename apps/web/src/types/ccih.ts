/**
 * Tipos do módulo CCIH (Comissão de Controle de Infecção Hospitalar) — Fase 10.
 *
 * Espelha os DTOs da API.
 */

/* ============================== Status / Resultado ============================== */

export const CCIH_STATUSES = ['ABERTO', 'EM_INVESTIGACAO', 'NOTIFICADO', 'ENCERRADO'] as const;
export type CcihStatus = (typeof CCIH_STATUSES)[number];

export const CCIH_STATUS_LABEL: Record<CcihStatus, string> = {
  ABERTO: 'Aberto',
  EM_INVESTIGACAO: 'Em investigação',
  NOTIFICADO: 'Notificado',
  ENCERRADO: 'Encerrado',
};

export const CCIH_STATUS_BADGE: Record<CcihStatus, string> = {
  ABERTO: 'bg-amber-100 text-amber-900 border-amber-300',
  EM_INVESTIGACAO: 'bg-blue-100 text-blue-900 border-blue-300',
  NOTIFICADO: 'bg-violet-100 text-violet-900 border-violet-300',
  ENCERRADO: 'bg-slate-200 text-slate-900 border-slate-400',
};

export const CCIH_RESULTADOS = ['CURA', 'OBITO', 'ALTA_COM_INFECCAO'] as const;
export type CcihResultado = (typeof CCIH_RESULTADOS)[number];

export const CCIH_RESULTADO_LABEL: Record<CcihResultado, string> = {
  CURA: 'Cura',
  OBITO: 'Óbito',
  ALTA_COM_INFECCAO: 'Alta com infecção',
};

export const ORIGENS_INFECCAO = ['COMUNITARIA', 'HOSPITALAR'] as const;
export type OrigemInfeccao = (typeof ORIGENS_INFECCAO)[number];

export const ORIGEM_INFECCAO_LABEL: Record<OrigemInfeccao, string> = {
  COMUNITARIA: 'Comunitária',
  HOSPITALAR: 'Hospitalar (IRAS)',
};

/* ============================== Antibiograma ============================== */

export const ANTIBIOTICO_RESULTADOS = ['SENSIVEL', 'INTERMEDIARIO', 'RESISTENTE'] as const;
export type AntibioticoResultado = (typeof ANTIBIOTICO_RESULTADOS)[number];

export const ANTIBIOTICO_RESULTADO_LABEL: Record<AntibioticoResultado, string> = {
  SENSIVEL: 'Sensível',
  INTERMEDIARIO: 'Intermediário',
  RESISTENTE: 'Resistente',
};

export const ANTIBIOTICO_RESULTADO_BADGE: Record<AntibioticoResultado, string> = {
  SENSIVEL: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  INTERMEDIARIO: 'bg-amber-100 text-amber-900 border-amber-300',
  RESISTENTE: 'bg-red-100 text-red-900 border-red-300',
};

export interface AntibiogramaItem {
  antibiotico: string;
  resultado: AntibioticoResultado;
  cmi?: string;
}

/* ============================== Caso ============================== */

export interface CcihContatoRisco {
  pacienteUuid: string;
  pacienteNome?: string | null;
  leitoUuid: string | null;
  leitoNumero?: string | null;
  setorUuid: string | null;
  setorNome?: string | null;
  /** Período em que o paciente esteve no mesmo setor/leito do caso. */
  inicio: string;
  fim: string | null;
  motivo: string;
}

export interface CcihHistoricoEvento {
  evento: 'CRIADO' | 'ATUALIZADO' | 'NOTIFICADO' | 'ENCERRADO';
  data: string;
  usuarioId: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}

export interface CcihCaso {
  uuid: string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  atendimentoUuid: string;
  atendimentoNumero?: string | null;
  setorUuid: string;
  setorNome?: string | null;
  leitoUuid: string | null;
  leitoNumero?: string | null;
  dataDiagnostico: string;
  topografia: string | null;
  cid: string | null;
  microorganismo: string | null;
  culturaOrigem: string | null;
  resistencia: AntibiogramaItem[] | null;
  origemInfeccao: OrigemInfeccao | null;
  resultado: CcihResultado | null;
  status: CcihStatus;
  observacao: string | null;
  notificadoEm: string | null;
  encerradoEm: string | null;
  contatosRisco?: CcihContatoRisco[];
  historico?: CcihHistoricoEvento[];
  createdAt: string;
  updatedAt: string | null;
}

export interface CcihCasoListItem {
  uuid: string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  setorUuid: string;
  setorNome?: string | null;
  dataDiagnostico: string;
  topografia: string | null;
  microorganismo: string | null;
  origemInfeccao: OrigemInfeccao | null;
  status: CcihStatus;
  resultado: CcihResultado | null;
}

export interface ListCasosParams {
  status?: CcihStatus | CcihStatus[];
  setorUuid?: string;
  microorganismo?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCasos {
  data: CcihCasoListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateCasoInput {
  pacienteUuid: string;
  atendimentoUuid: string;
  setorUuid: string;
  leitoUuid?: string | null;
  dataDiagnostico: string;
  topografia?: string | null;
  cid?: string | null;
  microorganismo?: string | null;
  culturaOrigem?: string | null;
  resistencia?: AntibiogramaItem[] | null;
  origemInfeccao?: OrigemInfeccao | null;
  observacao?: string | null;
}

export type UpdateCasoInput = Partial<CreateCasoInput>;

export interface NotificarCasoInput {
  observacao?: string;
  /** Quando preenchido, indica notificação compulsória ao MS/ANVISA. */
  compulsoria?: boolean;
}

export interface EncerrarCasoInput {
  resultado: CcihResultado;
  observacao?: string;
}

/* ============================== Painel epidemiológico ============================== */

export interface PainelTaxaSetor {
  setorUuid: string;
  setorNome?: string | null;
  /** Quantidade de casos de IRAS no período. */
  casos: number;
  /** Total de pacientes-dia (denominador). */
  pacientesDia: number;
  /** Taxa por mil pacientes-dia. */
  taxa: number;
}

export interface PainelTopItem {
  chave: string;
  contagem: number;
}

export interface PainelResistenciaItem {
  antibiotico: string;
  totalTestes: number;
  resistentes: number;
  intermediarios: number;
  sensiveis: number;
  /** Percentual de resistência (0-100). */
  taxaResistencia: number;
}

export interface PainelCcih {
  competencia: string;
  totalCasos: number;
  totalAbertos: number;
  totalEncerrados: number;
  totalNotificacoesCompulsorias: number;
  taxaPorSetor: PainelTaxaSetor[];
  topTopografias: PainelTopItem[];
  topMicroorganismos: PainelTopItem[];
  perfilResistencia: PainelResistenciaItem[];
}
