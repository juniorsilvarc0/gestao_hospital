/**
 * Tipos do Portal do Paciente (Fase 11 — Trilha R-B consumida pela R-C).
 *
 * Linguagem amigável: o frontend traduz nomes técnicos para termos claros
 * antes de exibir; aqui mantemos o contrato fiel à API.
 */

/* ============================== /me ============================== */

export interface PacienteMeResponse {
  uuid: string;
  nome: string;
  email: string | null;
  cpfMascarado: string | null;
  cnsMascarado: string | null;
  dataNascimento: string | null;
  telefone: string | null;
  fotoUrl: string | null;
  resumo: {
    proximaConsulta: PacienteAgendamentoResumo | null;
    examesDisponiveis: number;
    notificacoesNaoLidas: number;
    contasEmAberto: number;
  };
}

/* ============================== Agendamentos ============================== */

export type PacienteAgendamentoStatus =
  | 'AGENDADO'
  | 'CONFIRMADO'
  | 'COMPARECEU'
  | 'EM_ATENDIMENTO'
  | 'FALTOU'
  | 'CANCELADO'
  | 'REAGENDADO';

export interface PacienteAgendamentoResumo {
  uuid: string;
  inicio: string;
  fim: string;
  tipo: string;
  status: PacienteAgendamentoStatus;
  prestadorNome: string | null;
  procedimentoNome: string | null;
  unidadeNome: string | null;
  linkTeleconsulta: string | null;
}

export interface PacienteAgendamentosResponse {
  proximas: PacienteAgendamentoResumo[];
  passadas: PacienteAgendamentoResumo[];
}

export interface PacienteAgendamentoCreateInput {
  procedimentoUuid: string;
  prestadorUuid: string;
  inicio: string;
  fim: string;
  observacao?: string;
}

/* ============================== Exames ============================== */

export type PacienteExameStatus =
  | 'AGUARDANDO_COLETA'
  | 'EM_ANALISE'
  | 'LAUDADO'
  | 'CANCELADO';

export interface PacienteExameResumo {
  uuid: string;
  procedimentoNome: string | null;
  procedimentoCodigo: string | null;
  status: PacienteExameStatus;
  dataSolicitacao: string;
  dataColeta: string | null;
  dataLaudo: string | null;
  resultadoDisponivel: boolean;
}

export interface PacienteExamesResponse {
  data: PacienteExameResumo[];
  total: number;
}

export interface PacienteResultadoExameResponse {
  uuid: string;
  procedimentoNome: string | null;
  procedimentoCodigo: string | null;
  dataLaudo: string | null;
  dataColeta: string | null;
  laudoTexto: string | null;
  laudoPdfUrl: string | null;
  responsavelNome: string | null;
  responsavelConselho: string | null;
}

/* ============================== Receitas ============================== */

export interface PacienteReceitaResumo {
  uuid: string;
  dataEmissao: string;
  prescritorNome: string | null;
  prescritorConselho: string | null;
  numItens: number;
  validadeDias: number | null;
  pdfDisponivel: boolean;
}

export interface PacienteReceitasResponse {
  data: PacienteReceitaResumo[];
  total: number;
}

/* ============================== Teleconsulta ============================== */

export interface PacienteTeleconsultaLinkResponse {
  agendamentoUuid: string;
  linkAtivo: boolean;
  linkUrl: string | null;
  janelaInicio: string;
  janelaFim: string;
  motivo: string | null;
}

/* ============================== Contas ============================== */

export type PacienteContaStatus =
  | 'EM_ABERTO'
  | 'PARCIALMENTE_PAGA'
  | 'QUITADA'
  | 'GLOSADA'
  | 'CANCELADA';

export interface PacienteContaResumo {
  uuid: string;
  numero: string;
  status: PacienteContaStatus;
  dataAbertura: string;
  dataFechamento: string | null;
  valorTotal: string;
  valorPago: string;
  valorAberto: string;
  convenioNome: string | null;
  espelhoDisponivel: boolean;
}

export interface PacienteContasResponse {
  data: PacienteContaResumo[];
  total: number;
}

export interface PacienteEspelhoContaItem {
  descricao: string;
  quantidade: number;
  valorUnitario: string;
  valorTotal: string;
  data: string | null;
}

export interface PacienteEspelhoContaResponse {
  contaUuid: string;
  contaNumero: string;
  pacienteNome: string;
  dataAbertura: string;
  dataFechamento: string | null;
  itens: PacienteEspelhoContaItem[];
  valorTotal: string;
  valorPago: string;
  valorAberto: string;
}

/* ============================== Consentimentos LGPD ============================== */

export type ConsentimentoTipo =
  | 'TERMO_GERAL'
  | 'COMPARTILHAMENTO_CONVENIO'
  | 'TELECONSULTA'
  | 'PESQUISA'
  | 'COMUNICACAO_MARKETING';

export interface PacienteConsentimentoResponse {
  uuid: string;
  tipo: ConsentimentoTipo;
  titulo: string;
  descricao: string;
  versao: string;
  aceito: boolean;
  dataAceite: string | null;
  dataRevogacao: string | null;
  obrigatorio: boolean;
}

export interface PacienteConsentimentosResponse {
  data: PacienteConsentimentoResponse[];
}

export interface AceitarConsentimentoInput {
  tipo: ConsentimentoTipo;
  versao: string;
}

/* ============================== Notificações ============================== */

export type NotificacaoCanal = 'PUSH' | 'EMAIL' | 'SMS' | 'IN_APP';
export type NotificacaoStatus = 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA';

export interface PacienteNotificacaoResponse {
  uuid: string;
  titulo: string;
  mensagem: string;
  canal: NotificacaoCanal;
  status: NotificacaoStatus;
  dataEnvio: string;
  dataLeitura: string | null;
  link: string | null;
}

export interface PacienteNotificacoesResponse {
  data: PacienteNotificacaoResponse[];
  total: number;
  naoLidas: number;
}
