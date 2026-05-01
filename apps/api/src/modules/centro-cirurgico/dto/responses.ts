/**
 * DTOs de resposta — leituras paginadas e detalhes do módulo Centro
 * Cirúrgico.
 */
import type {
  CirurgiaClassificacao,
  CirurgiaStatus,
  CirurgiaTipoAnestesia,
} from '../domain/cirurgia';
import type { OpmeItem } from '../domain/opme';

export interface EquipeMembroResponse {
  prestadorUuid: string;
  prestadorNome: string | null;
  funcao: string;
  ordem: number;
  contaItemUuid: string | null;
}

export interface ProcedimentoSecundarioResponse {
  procedimentoUuid: string;
  quantidade: number;
}

export interface CirurgiaResponse {
  uuid: string;
  atendimentoUuid: string;
  pacienteUuid: string;
  pacienteNome: string | null;
  procedimentoPrincipalUuid: string;
  procedimentoPrincipalNome: string | null;
  procedimentosSecundarios: ProcedimentoSecundarioResponse[];
  salaUuid: string;
  salaNome: string | null;
  setorUuid: string | null;
  dataHoraAgendada: string;
  duracaoEstimadaMinutos: number | null;
  dataHoraInicio: string | null;
  dataHoraFim: string | null;
  cirurgiaoUuid: string;
  cirurgiaoNome: string | null;
  tipoAnestesia: CirurgiaTipoAnestesia | null;
  classificacaoCirurgia: CirurgiaClassificacao;
  exigeAutorizacaoConvenio: boolean;
  kitCirurgicoUuid: string | null;
  cadernoGabaritoUuid: string | null;
  fichaCirurgicaPreenchida: boolean;
  fichaAnestesicaPreenchida: boolean;
  intercorrencias: string | null;
  status: CirurgiaStatus;
  contaUuid: string | null;
  opmeSolicitada: OpmeItem[];
  opmeAutorizada: OpmeItem[];
  opmeUtilizada: OpmeItem[];
  cancelamentoMotivo: string | null;
  canceladoEm: string | null;
  equipe: EquipeMembroResponse[];
}

export interface KitItemResponse {
  procedimentoUuid: string;
  procedimentoNome: string | null;
  quantidade: string;
  obrigatorio: boolean;
}

export interface KitResponse {
  uuid: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  itens: KitItemResponse[];
}

export interface GabaritoItemResponse {
  procedimentoUuid: string;
  procedimentoNome: string | null;
  quantidadePadrao: string;
  obrigatorio: boolean;
  observacao: string | null;
}

export interface GabaritoResponse {
  uuid: string;
  procedimentoPrincipalUuid: string;
  procedimentoPrincipalNome: string | null;
  cirurgiaoUuid: string | null;
  cirurgiaoNome: string | null;
  versao: number;
  ativo: boolean;
  observacao: string | null;
  itens: GabaritoItemResponse[];
}

export interface MapaSalaResponse {
  salaUuid: string;
  salaNome: string;
  setor: string | null;
  cirurgias: Array<{
    uuid: string;
    status: CirurgiaStatus;
    pacienteUuid: string;
    pacienteNome: string | null;
    procedimentoPrincipalUuid: string;
    procedimentoPrincipalNome: string | null;
    cirurgiaoUuid: string;
    cirurgiaoNome: string | null;
    horaInicio: string;
    horaFim: string;
    horaInicioReal: string | null;
    horaFimReal: string | null;
    classificacao: CirurgiaClassificacao;
    tipoAnestesia: CirurgiaTipoAnestesia | null;
  }>;
}

export interface MapaSalasResponse {
  data: string; // YYYY-MM-DD
  salas: MapaSalaResponse[];
}

export interface CirurgiasListResponse {
  data: CirurgiaResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface KitsListResponse {
  data: KitResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface GabaritosListResponse {
  data: GabaritoResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
