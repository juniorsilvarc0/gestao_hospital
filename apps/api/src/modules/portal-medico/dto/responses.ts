/**
 * DTOs de resposta — Portal do Médico (read-only).
 *
 * As respostas são *views agregadas* construídas a partir dos módulos
 * existentes (agendamento, exames, centro-cirúrgico, repasse). Não há
 * tabelas próprias do portal — toda persistência mora nos bounded
 * contexts originais.
 */
import type { RepasseStatus } from '../../repasse/domain/repasse-lifecycle';

// ───────────────────────── /me ─────────────────────────

export interface MedicoPrestadorInfo {
  uuid: string;
  nome: string;
  conselhoSigla: string | null;
  conselhoNumero: string | null;
  ufConselho: string | null;
  cbo: string | null;
  tipoVinculo: string | null;
  rqe: string | null;
  recebeRepasse: boolean;
  ativo: boolean;
}

export interface ProximaConsultaResumo {
  agendamentoUuid: string;
  dataHora: string;
  pacienteUuid: string;
  pacienteNome: string;
  recursoUuid: string;
  tipo: string;
  linkTeleconsulta: string | null;
}

export interface RepasseResumo {
  uuid: string;
  competencia: string;
  status: RepasseStatus;
  valorBruto: string;
  valorLiquido: string;
  qtdItens: number;
}

export interface MedicoMeResponse {
  prestador: MedicoPrestadorInfo;
  permissoes: string[];
  resumo: {
    proximaConsulta: ProximaConsultaResumo | null;
    laudosPendentes: number;
    cirurgiasHoje: number;
    repasseUltimaCompetencia: RepasseResumo | null;
  };
}

// ───────────────────────── Agenda ─────────────────────────

export interface AgendaItemResponse {
  uuid: string;
  inicio: string;
  fim: string;
  tipo: string;
  status: string;
  encaixe: boolean;
  pacienteUuid: string;
  pacienteNome: string;
  procedimentoUuid: string | null;
  observacao: string | null;
  linkTeleconsulta: string | null;
  recursoUuid: string;
}

export interface AgendaResponse {
  dataInicio: string;
  dataFim: string;
  data: AgendaItemResponse[];
}

// ───────────────────────── Laudos ─────────────────────────

export interface LaudoPendenteResponse {
  resultadoUuid: string;
  solicitacaoUuid: string;
  pacienteUuid: string;
  pacienteNome: string | null;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  procedimentoCodigo: string | null;
  status: string;
  dataColeta: string | null;
  dataProcessamento: string | null;
  createdAt: string;
}

export interface LaudosPendentesResponse {
  data: LaudoPendenteResponse[];
  total: number;
}

// ───────────────────────── Produção ─────────────────────────

export interface ProducaoAgregadoTipo {
  tipo: string;
  qtd: number;
  valor: string;
}

export interface ProducaoAgregadoFuncao {
  funcao: string;
  qtd: number;
  valor: string;
}

export interface ProducaoResponse {
  competencia: string;
  totalAtendimentos: number;
  totalCirurgias: number;
  totalLaudos: number;
  porTipo: ProducaoAgregadoTipo[];
  porFuncao: ProducaoAgregadoFuncao[];
}

// ───────────────────────── Repasses ─────────────────────────

export interface RepasseMedicoListItem {
  uuid: string;
  competencia: string;
  status: RepasseStatus;
  valorBruto: string;
  valorLiquido: string;
  qtdItens: number;
  dataApuracao: string;
  dataPagamento: string | null;
}

export interface RepassesMedicoListResponse {
  data: RepasseMedicoListItem[];
  total: number;
}

export interface RepasseItemMedicoResponse {
  uuid: string;
  contaNumero: string | null;
  pacienteNome: string | null;
  procedimentoCodigo: string | null;
  procedimentoNome: string | null;
  funcao: string | null;
  baseCalculo: string;
  valorCalculado: string;
  glosado: boolean;
  observacao: string | null;
}

export interface RepasseMedicoDetalheResponse {
  repasse: RepasseMedicoListItem & {
    valorCreditos: string;
    valorDebitos: string;
    valorDescontos: string;
    valorImpostos: string;
    observacao: string | null;
  };
  itens: RepasseItemMedicoResponse[];
}

// ───────────────────────── Cirurgias ─────────────────────────

export interface CirurgiaAgendadaResponse {
  uuid: string;
  dataHoraAgendada: string;
  duracaoEstimadaMinutos: number | null;
  pacienteUuid: string;
  pacienteNome: string | null;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  salaUuid: string;
  salaNome: string;
  status: string;
  papel: 'CIRURGIAO' | 'EQUIPE';
  funcao: string | null;
}

export interface CirurgiasAgendadasResponse {
  dataInicio: string;
  dataFim: string;
  data: CirurgiaAgendadaResponse[];
}

// ───────────────────────── Dashboard ─────────────────────────

export interface DashboardProximaItem {
  tipo: 'consulta' | 'cirurgia';
  uuid: string;
  data: string;
  pacienteUuid: string;
  pacienteNome: string | null;
  observacao: string | null;
}

export interface DashboardMedicoResponse {
  hoje: {
    agendamentos: number;
    cirurgias: number;
    laudosPendentes: number;
  };
  semana: {
    agendamentos: number;
    cirurgias: number;
  };
  competenciaAtual: {
    competencia: string;
    repasse: {
      uuid: string;
      status: RepasseStatus;
      valorLiquido: string;
      qtdItens: number;
    } | null;
    producaoTotal: {
      qtd: number;
      valor: string;
    };
  };
  proximas: DashboardProximaItem[];
}
