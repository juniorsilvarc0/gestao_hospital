/**
 * DTOs de resposta — leituras de Critério e Apuração de repasse.
 */
import type {
  RepasseMomento,
  RepasseTipoBaseCalculo,
} from '../domain/criterio';

export interface CriterioResponse {
  uuid: string;
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  unidadeFaturamentoUuid: string | null;
  unidadeAtendimentoUuid: string | null;
  tipoBaseCalculo: RepasseTipoBaseCalculo;
  momentoRepasse: RepasseMomento;
  diaFechamento: number | null;
  prazoDias: number | null;
  prioridade: number;
  ativo: boolean;
  regras: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListCriteriosResponse {
  data: CriterioResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * Status de job BullMQ. Espelha os estados retornados por
 * `Job.getState()` — não criamos nosso próprio enum.
 */
export type ApuracaoJobStatus =
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'stuck'
  | 'unknown';

export interface ApurarResponse {
  jobId: string;
  status: ApuracaoJobStatus;
  competencia: string;
  enqueuedAt: string;
}

export interface ApuracaoJobResult {
  /** Quantos prestadores tinham contas elegíveis. */
  prestadoresProcessados: number;
  /** Repasses inseridos (novos) */
  repassesCriados: number;
  /** Repasses re-apurados (forceReapuracao). */
  repassesReapurados: number;
  /** Itens inseridos. */
  itensInseridos: number;
  /** Lista de prestadores ignorados (com motivo). */
  ignorados: Array<{
    prestadorUuid: string;
    motivo: string;
  }>;
}

export interface JobStatusResponse {
  jobId: string;
  status: ApuracaoJobStatus;
  progress: number | null;
  result: ApuracaoJobResult | null;
  failedReason: string | null;
  enqueuedAt: string;
  finishedAt: string | null;
  attemptsMade: number;
}
