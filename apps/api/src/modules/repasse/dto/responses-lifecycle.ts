/**
 * DTOs de resposta — lifecycle, folha e reapuração do módulo Repasse (R-B).
 *
 * Estes tipos vivem ao lado de `responses.ts` (R-A — critérios + apuração).
 * R-B usa nomes terminados em `-lifecycle` para evitar colisão de nomes/
 * conflitos no merge.
 */
import type { RepasseStatus } from '../domain/repasse-lifecycle';

export interface RepasseResponse {
  uuid: string;
  prestadorUuid: string;
  prestadorNome: string;
  competencia: string;
  status: RepasseStatus;
  valorBruto: string;
  valorCreditos: string;
  valorDebitos: string;
  valorDescontos: string;
  valorImpostos: string;
  valorLiquido: string;
  qtdItens: number;
  dataApuracao: string;
  dataConferencia: string | null;
  conferidoPorUuid: string | null;
  dataLiberacao: string | null;
  liberadoPorUuid: string | null;
  dataPagamento: string | null;
  pagoPorUuid: string | null;
  canceladoEm: string | null;
  canceladoMotivo: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface RepasseItemResponse {
  uuid: string;
  contaUuid: string;
  contaNumero: string | null;
  contaItemUuid: string | null;
  cirurgiaUuid: string | null;
  pacienteNome: string | null;
  procedimentoCodigo: string | null;
  procedimentoNome: string | null;
  funcao: string | null;
  baseCalculo: string;
  percentual: string | null;
  valorFixo: string | null;
  valorCalculado: string;
  glosado: boolean;
  observacao: string | null;
  criterioUuid: string | null;
  criterioDescricao: string | null;
  reapuradoDeUuid: string | null;
  createdAt: string;
}

export interface RepasseDetalheResponse {
  repasse: RepasseResponse;
  itens: RepasseItemResponse[];
}

export interface ListRepassesResponse {
  data: RepasseResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// ─── Folha ─────────────────────────────────────────────────────────────

export interface FolhaPrestadorResumo {
  prestadorUuid: string;
  nome: string;
  conselhoSigla: string | null;
  conselhoNumero: string | null;
  repasseUuid: string;
  status: RepasseStatus;
  valorBruto: string;
  valorLiquido: string;
  qtdItens: number;
}

export interface FolhaResumoResponse {
  competencia: string;
  data: FolhaPrestadorResumo[];
  totalGeral: {
    valorBruto: string;
    valorLiquido: string;
    qtdRepasses: number;
    qtdItens: number;
  };
}

export interface FolhaAgregadoFuncao {
  funcao: string;
  qtd: number;
  valor: string;
}

export interface FolhaAgregadoCriterio {
  criterioUuid: string | null;
  descricao: string | null;
  qtd: number;
  valor: string;
}

export interface FolhaPrestadorResponse {
  prestador: {
    uuid: string;
    nome: string;
    conselhoSigla: string | null;
    conselhoNumero: string | null;
  };
  competencia: string;
  repasse: RepasseResponse | null;
  itens: RepasseItemResponse[];
  agregadoPorFuncao: FolhaAgregadoFuncao[];
  agregadoPorCriterio: FolhaAgregadoCriterio[];
}
