/**
 * Tipos do bounded context Leitos (Trilha B da Fase 5).
 *
 * Espelha DB.md §7.2 (`leitos`).
 *
 * Convenções:
 *  - `uuid` é o identificador externo.
 *  - `versao` integer — usado em otimistic lock ao alocar/transferir
 *    (RN-ATE-08 e §10.5 do DB.md).
 *  - `status` segue o ENUM `enum_leito_status`.
 */

export type LeitoStatus =
  | 'DISPONIVEL'
  | 'OCUPADO'
  | 'RESERVADO'
  | 'HIGIENIZACAO'
  | 'MANUTENCAO'
  | 'BLOQUEADO';

export type TipoAcomodacao =
  | 'ENFERMARIA'
  | 'APARTAMENTO'
  | 'UTI'
  | 'SEMI_UTI'
  | 'ISOLAMENTO'
  | 'OBSERVACAO';

export interface LeitoOcupacao {
  pacienteUuid?: string | null;
  pacienteNome?: string | null;
  pacienteIdade?: number | null;
  atendimentoUuid?: string | null;
  prestadorNome?: string | null;
  alergias?: string[] | null;
  iniciadoEm?: string | null;
  previstoFim?: string | null;
  diasInternado?: number | null;
}

export interface Leito {
  uuid: string;
  codigo: string;
  setorUuid: string;
  setorNome?: string | null;
  tipoAcomodacao: TipoAcomodacao;
  status: LeitoStatus;
  versao: number;
  extra?: boolean;
  observacao?: string | null;
  ocupacao?: LeitoOcupacao | null;
}

export interface ListLeitosParams {
  setorUuid?: string;
  status?: LeitoStatus;
  q?: string;
}

export interface PaginatedLeitos {
  data: Leito[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface MapaLeitosSetor {
  setorUuid: string;
  setorNome: string;
  unidadeNome?: string | null;
  leitos: Leito[];
}

export interface MapaLeitos {
  setores: MapaLeitosSetor[];
  geradoEm: string;
}

export interface LeitoStatusUpdateInput {
  status: LeitoStatus;
  versao: number;
  observacao?: string;
}

/** Eventos do namespace `/leitos`. */
export type LeitoEventoTipo =
  | 'leito.alocado'
  | 'leito.liberado'
  | 'leito.higienizando'
  | 'leito.disponivel'
  | 'leito.manutencao'
  | 'leito.bloqueado'
  | 'leito.reservado';

export interface LeitoEvento {
  leitoUuid: string;
  setorUuid: string;
  status: LeitoStatus;
  versao: number;
  tipo: LeitoEventoTipo;
  ocupacao?: LeitoOcupacao | null;
  emitidoEm: string;
}

export interface LeitoCorPalette {
  badge: string;
  card: string;
  border: string;
  label: string;
  emoji: string;
}

export const LEITO_STATUS_PALETTE: Record<LeitoStatus, LeitoCorPalette> = {
  DISPONIVEL: {
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    card: 'bg-emerald-50',
    border: 'border-emerald-400',
    label: 'Disponível',
    emoji: '🟢',
  },
  OCUPADO: {
    badge: 'bg-red-100 text-red-900 border-red-300',
    card: 'bg-red-50',
    border: 'border-red-500',
    label: 'Ocupado',
    emoji: '🔴',
  },
  RESERVADO: {
    badge: 'bg-orange-100 text-orange-900 border-orange-300',
    card: 'bg-orange-50',
    border: 'border-orange-400',
    label: 'Reservado',
    emoji: '🟠',
  },
  HIGIENIZACAO: {
    badge: 'bg-yellow-100 text-yellow-900 border-yellow-300',
    card: 'bg-yellow-50',
    border: 'border-yellow-400',
    label: 'Higienização',
    emoji: '🟡',
  },
  MANUTENCAO: {
    badge: 'bg-zinc-200 text-zinc-900 border-zinc-300',
    card: 'bg-zinc-50',
    border: 'border-zinc-400',
    label: 'Manutenção',
    emoji: '⚙️',
  },
  BLOQUEADO: {
    badge: 'bg-zinc-300 text-zinc-900 border-zinc-400',
    card: 'bg-zinc-100',
    border: 'border-zinc-500',
    label: 'Bloqueado',
    emoji: '⛔',
  },
};
