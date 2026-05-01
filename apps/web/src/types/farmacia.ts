/**
 * Tipos do módulo Farmácia (Fase 7 — Trilha A da API).
 *
 * Espelha os DTOs de resposta em
 * `apps/api/src/modules/farmacia/dto/responses.ts`.
 *
 * Convenções:
 *  - Quantidades vêm como strings (DECIMAL preserva precisão).
 *  - `turno` é derivado no servidor a partir da `dataHora`.
 *  - `validade` está em formato ISO date `YYYY-MM-DD`.
 */

export const DISPENSACAO_STATUSES = [
  'PENDENTE',
  'SEPARADA',
  'DISPENSADA',
  'DEVOLVIDA',
  'CANCELADA',
] as const;
export type DispensacaoStatus = (typeof DISPENSACAO_STATUSES)[number];

export const DISPENSACAO_TIPOS = [
  'PRESCRICAO',
  'AVULSA',
  'KIT_CIRURGICO',
  'DEVOLUCAO',
] as const;
export type DispensacaoTipo = (typeof DISPENSACAO_TIPOS)[number];

export const DISPENSACAO_TURNOS = [
  'MANHA',
  'TARDE',
  'NOITE',
  'MADRUGADA',
] as const;
export type DispensacaoTurno = (typeof DISPENSACAO_TURNOS)[number];

export interface DispensacaoItem {
  uuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  prescricaoItemUuid: string | null;
  quantidadePrescrita: string;
  quantidadeDispensada: string;
  unidadeMedida: string | null;
  fatorConversaoAplicado: string | null;
  justificativaDivergencia: string | null;
  lote: string | null;
  validade: string | null;
  contaItemUuid: string | null;
  status: DispensacaoStatus;
}

export interface Dispensacao {
  uuid: string;
  atendimentoUuid: string;
  pacienteUuid: string;
  pacienteNome?: string | null;
  leitoCodigo?: string | null;
  prescricaoUuid: string | null;
  cirurgiaUuid: string | null;
  setorDestinoUuid: string | null;
  farmaceuticoUuid: string;
  farmaceuticoNome?: string | null;
  prescritorNome?: string | null;
  dataHora: string;
  turno: DispensacaoTurno | null;
  tipo: DispensacaoTipo;
  status: DispensacaoStatus;
  observacao: string | null;
  dispensacaoOrigemUuid: string | null;
  itens: DispensacaoItem[];
}

export interface PainelTurnoBucket {
  turno: DispensacaoTurno;
  quantidade: number;
  pendentes: number;
  separadas: number;
  dispensacoes: Dispensacao[];
}

export interface PainelFarmacia {
  geradoEm: string;
  total: number;
  buckets: PainelTurnoBucket[];
}

export interface ListPainelParams {
  turno?: DispensacaoTurno;
  status?: DispensacaoStatus[];
  limit?: number;
  data?: string;
}

export interface CreateDispensacaoItemInput {
  procedimentoUuid: string;
  prescricaoItemUuid?: string;
  quantidadePrescrita: number;
  quantidadeDispensada: number;
  unidadeMedida?: string;
  fatorConversaoAplicado?: number;
  justificativaDivergencia?: string;
  lote?: string;
  validade?: string;
}

export interface CreateDispensacaoInput {
  atendimentoUuid: string;
  prescricaoUuid?: string;
  cirurgiaUuid?: string;
  setorDestinoUuid?: string;
  dataHora: string;
  tipo: 'PRESCRICAO' | 'AVULSA' | 'KIT_CIRURGICO';
  motivoAvulsa?: string;
  observacao?: string;
  itens: CreateDispensacaoItemInput[];
}

export interface SepararItemInput {
  itemUuid: string;
  lote?: string;
  validade?: string;
}

export interface SepararDispensacaoInput {
  itens: SepararItemInput[];
}

export interface DevolverItemInput {
  itemOriginalUuid: string;
  quantidadeDevolvida: number;
}

export interface DevolverDispensacaoInput {
  motivoDevolucao: string;
  observacao?: string;
  itens: DevolverItemInput[];
}

export const LIVRO_TIPOS_MOVIMENTO = [
  'ENTRADA',
  'SAIDA',
  'AJUSTE',
  'PERDA',
] as const;
export type LivroTipoMovimento = (typeof LIVRO_TIPOS_MOVIMENTO)[number];

export interface LivroControladosLinha {
  uuid: string;
  dataHora: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  lote: string;
  quantidade: string;
  saldoAnterior: string;
  saldoAtual: string;
  tipoMovimento: LivroTipoMovimento;
  pacienteUuid: string | null;
  pacienteNome?: string | null;
  prescricaoId: string | null;
  dispensacaoItemUuid: string | null;
  receitaDocumentoUrl: string | null;
  farmaceuticoUuid: string;
  farmaceuticoNome?: string | null;
  observacao: string | null;
}

export interface LivroControladosListParams {
  procedimentoUuid?: string;
  dataInicio?: string;
  dataFim?: string;
  lote?: string;
  tipoMovimento?: LivroTipoMovimento;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLivroControlados {
  data: LivroControladosLinha[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateMovimentoControladoInput {
  procedimentoUuid: string;
  lote: string;
  quantidade: number;
  tipoMovimento: LivroTipoMovimento;
  saldoAtualAjuste?: number;
  pacienteUuid?: string;
  receitaDocumentoUrl?: string;
  observacao?: string;
}

export interface MovimentoControladoResult {
  uuid: string;
  saldoAnterior: string;
  saldoAtual: string;
}

/** Eventos do namespace `/farmacia`. */
export type DispensacaoEventoTipo =
  | 'dispensacao.criada'
  | 'dispensacao.separada'
  | 'dispensacao.dispensada'
  | 'dispensacao.devolvida';

export interface DispensacaoEventoPayload {
  tenantId: string;
  dispensacao: Dispensacao;
  originalUuid?: string;
}

export const DISPENSACAO_STATUS_LABEL: Record<DispensacaoStatus, string> = {
  PENDENTE: 'Pendente',
  SEPARADA: 'Separada',
  DISPENSADA: 'Dispensada',
  DEVOLVIDA: 'Devolvida',
  CANCELADA: 'Cancelada',
};

export const DISPENSACAO_TURNO_LABEL: Record<DispensacaoTurno, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
  MADRUGADA: 'Madrugada',
};
