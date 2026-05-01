/**
 * Tipos do módulo Centro Cirúrgico (Fase 7 — Trilha B da API).
 *
 * Espelha (com pequenas ampliações para conveniência do frontend) as
 * entidades de domínio em `apps/api/src/modules/centro-cirurgico/domain`.
 */

export const CIRURGIA_STATUSES = [
  'AGENDADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
  'SUSPENSA',
] as const;
export type CirurgiaStatus = (typeof CIRURGIA_STATUSES)[number];

export const CIRURGIA_TIPOS_ANESTESIA = [
  'GERAL',
  'RAQUIDIANA',
  'PERIDURAL',
  'BLOQUEIO',
  'LOCAL',
  'SEDACAO',
  'NENHUMA',
] as const;
export type CirurgiaTipoAnestesia = (typeof CIRURGIA_TIPOS_ANESTESIA)[number];

export const CIRURGIA_CLASSIFICACOES = [
  'ELETIVA',
  'URGENCIA',
  'EMERGENCIA',
] as const;
export type CirurgiaClassificacao = (typeof CIRURGIA_CLASSIFICACOES)[number];

export const EQUIPE_FUNCOES = [
  'CIRURGIAO',
  'AUXILIAR',
  'ANESTESISTA',
  'INSTRUMENTADOR',
  'CIRCULANTE',
  'RESIDENTE',
] as const;
export type EquipeFuncao = (typeof EQUIPE_FUNCOES)[number];

export interface EquipeMembro {
  uuid?: string;
  prestadorUuid: string;
  prestadorNome?: string | null;
  funcao: EquipeFuncao;
  ordem: number;
}

export const OPME_STATUSES = [
  'SOLICITADA',
  'AUTORIZADA',
  'NEGADA',
  'UTILIZADA',
] as const;
export type OpmeStatus = (typeof OPME_STATUSES)[number];

export interface OpmeItem {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome?: string | null;
  fornecedorNome?: string | null;
  quantidadeSolicitada: string;
  quantidadeAutorizada?: string | null;
  quantidadeUtilizada?: string | null;
  status: OpmeStatus;
  observacao?: string | null;
  loteUtilizado?: string | null;
}

export interface ProcedimentoCirurgico {
  uuid?: string;
  procedimentoUuid: string;
  procedimentoNome?: string | null;
  principal: boolean;
  ladoCirurgico?: 'DIREITO' | 'ESQUERDO' | 'BILATERAL' | null;
}

export interface FichaCirurgicaSecao {
  /** Chave da seção: descricao, achados, intercorrencias, etc. */
  chave: string;
  texto: string;
}

export interface FichaCirurgicaConteudo {
  secoes: FichaCirurgicaSecao[];
  /** ISO timestamps. */
  inicioAnestesia?: string | null;
  inicioCirurgia?: string | null;
  fimCirurgia?: string | null;
  fimAnestesia?: string | null;
}

export interface FichaAnestesicaDroga {
  nome: string;
  dose: string;
  unidade?: string;
  via?: string;
  hora?: string;
}

export interface FichaAnestesicaConteudo {
  tipoAnestesia: CirurgiaTipoAnestesia;
  drogas: FichaAnestesicaDroga[];
  intercorrencias?: string;
  observacoes?: string;
  /** Sinais vitais ao longo do procedimento (snapshot por horário). */
  sinaisVitais?: Array<{
    hora: string;
    pa?: string;
    fc?: number;
    sat?: number;
    temperatura?: number;
  }>;
}

export interface KitCirurgicoItem {
  uuid?: string;
  procedimentoUuid: string;
  procedimentoNome?: string | null;
  quantidade: number;
  obrigatorio: boolean;
}

export interface KitCirurgico {
  uuid: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  itens: KitCirurgicoItem[];
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface CadernoGabaritoItem {
  uuid?: string;
  procedimentoUuid: string;
  procedimentoNome?: string | null;
  quantidadePadrao: number;
  obrigatorio: boolean;
}

export interface CadernoGabarito {
  uuid: string;
  nome: string;
  procedimentoPrincipalUuid: string;
  procedimentoPrincipalNome?: string | null;
  cirurgiaoUuid?: string | null;
  cirurgiaoNome?: string | null;
  versao: number;
  ativo: boolean;
  itens: CadernoGabaritoItem[];
}

export interface CirurgiaResumo {
  uuid: string;
  numero?: string | null;
  pacienteUuid: string;
  pacienteNome: string;
  atendimentoUuid: string | null;
  atendimentoNumero?: string | null;
  procedimentoPrincipalUuid: string;
  procedimentoPrincipalNome: string;
  salaUuid: string;
  salaNome: string;
  cirurgiaoUuid: string;
  cirurgiaoNome: string;
  inicioPrevisto: string;
  fimPrevisto: string;
  inicioReal?: string | null;
  fimReal?: string | null;
  duracaoMinutos: number;
  classificacao: CirurgiaClassificacao;
  tipoAnestesia: CirurgiaTipoAnestesia;
  status: CirurgiaStatus;
}

export interface Cirurgia extends CirurgiaResumo {
  procedimentos: ProcedimentoCirurgico[];
  equipe: EquipeMembro[];
  opme: OpmeItem[];
  kitCirurgicoUuid?: string | null;
  kitCirurgicoNome?: string | null;
  cadernoGabaritoUuid?: string | null;
  cadernoGabaritoNome?: string | null;
  fichaCirurgica?: FichaCirurgicaConteudo | null;
  fichaAnestesica?: FichaAnestesicaConteudo | null;
  observacao?: string | null;
  motivoCancelamento?: string | null;
}

export interface SalaResumoMapa {
  salaUuid: string;
  salaNome: string;
  cirurgias: CirurgiaResumo[];
}

export interface MapaSalas {
  data: string;
  geradoEm: string;
  salas: SalaResumoMapa[];
}

export interface ListCirurgiasParams {
  data?: string;
  dataInicio?: string;
  dataFim?: string;
  salaUuid?: string;
  cirurgiaoUuid?: string;
  status?: CirurgiaStatus;
  page?: number;
  pageSize?: number;
}

export interface PaginatedCirurgias {
  data: CirurgiaResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateCirurgiaInput {
  pacienteUuid: string;
  atendimentoUuid?: string;
  procedimentoPrincipalUuid: string;
  procedimentos?: Array<{
    procedimentoUuid: string;
    principal?: boolean;
    ladoCirurgico?: 'DIREITO' | 'ESQUERDO' | 'BILATERAL';
  }>;
  salaUuid: string;
  inicioPrevisto: string;
  duracaoMinutos: number;
  cirurgiaoUuid: string;
  equipe?: Array<{
    prestadorUuid: string;
    funcao: EquipeFuncao;
    ordem?: number;
  }>;
  classificacao: CirurgiaClassificacao;
  tipoAnestesia: CirurgiaTipoAnestesia;
  kitCirurgicoUuid?: string;
  cadernoGabaritoUuid?: string;
  observacao?: string;
}

export interface UpdateCirurgiaInput {
  salaUuid?: string;
  inicioPrevisto?: string;
  duracaoMinutos?: number;
  classificacao?: CirurgiaClassificacao;
  tipoAnestesia?: CirurgiaTipoAnestesia;
  observacao?: string;
}

export interface CancelarCirurgiaInput {
  motivo: string;
}

export interface OpmeSolicitarInput {
  itens: Array<{
    procedimentoUuid: string;
    fornecedorNome?: string;
    quantidadeSolicitada: number;
    observacao?: string;
  }>;
}

export interface OpmeAutorizarInput {
  itens: Array<{
    opmeItemUuid: string;
    quantidadeAutorizada: number;
    aprovado: boolean;
    observacao?: string;
  }>;
}

export interface OpmeUtilizarInput {
  itens: Array<{
    opmeItemUuid: string;
    quantidadeUtilizada: number;
    loteUtilizado?: string;
  }>;
}

export type CirurgiaEventoTipo =
  | 'cirurgia.agendada'
  | 'cirurgia.confirmada'
  | 'cirurgia.iniciada'
  | 'cirurgia.encerrada'
  | 'cirurgia.cancelada';

export interface CirurgiaEventoPayload {
  tenantId: string;
  cirurgia: CirurgiaResumo;
}

export const CIRURGIA_STATUS_LABEL: Record<CirurgiaStatus, string> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  SUSPENSA: 'Suspensa',
};

export const CIRURGIA_STATUS_COLOR: Record<
  CirurgiaStatus,
  { bg: string; border: string; text: string; badge: string }
> = {
  AGENDADA: {
    bg: '#e2e8f0',
    border: '#94a3b8',
    text: '#0f172a',
    badge: 'bg-zinc-100 text-zinc-900 border-zinc-300',
  },
  CONFIRMADA: {
    bg: '#bfdbfe',
    border: '#2563eb',
    text: '#0f172a',
    badge: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  EM_ANDAMENTO: {
    bg: '#fed7aa',
    border: '#ea580c',
    text: '#0f172a',
    badge: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  CONCLUIDA: {
    bg: '#bbf7d0',
    border: '#16a34a',
    text: '#0f172a',
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  CANCELADA: {
    bg: '#fecaca',
    border: '#dc2626',
    text: '#0f172a',
    badge: 'bg-red-100 text-red-900 border-red-300',
  },
  SUSPENSA: {
    bg: '#fde68a',
    border: '#ca8a04',
    text: '#0f172a',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
};

export const CIRURGIA_TIPO_ANESTESIA_LABEL: Record<
  CirurgiaTipoAnestesia,
  string
> = {
  GERAL: 'Geral',
  RAQUIDIANA: 'Raquidiana',
  PERIDURAL: 'Peridural',
  BLOQUEIO: 'Bloqueio',
  LOCAL: 'Local',
  SEDACAO: 'Sedação',
  NENHUMA: 'Nenhuma',
};

export const CIRURGIA_CLASSIFICACAO_LABEL: Record<
  CirurgiaClassificacao,
  string
> = {
  ELETIVA: 'Eletiva',
  URGENCIA: 'Urgência',
  EMERGENCIA: 'Emergência',
};

export const EQUIPE_FUNCAO_LABEL: Record<EquipeFuncao, string> = {
  CIRURGIAO: 'Cirurgião',
  AUXILIAR: 'Auxiliar',
  ANESTESISTA: 'Anestesista',
  INSTRUMENTADOR: 'Instrumentador',
  CIRCULANTE: 'Circulante',
  RESIDENTE: 'Residente',
};

export const OPME_STATUS_LABEL: Record<OpmeStatus, string> = {
  SOLICITADA: 'Solicitada',
  AUTORIZADA: 'Autorizada',
  NEGADA: 'Negada',
  UTILIZADA: 'Utilizada',
};
