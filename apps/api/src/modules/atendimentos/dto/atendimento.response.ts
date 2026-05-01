/**
 * Tipos de resposta para endpoints de atendimentos.
 */

export interface AtendimentoResponse {
  uuid: string;
  numeroAtendimento: string;
  pacienteUuid: string;
  prestadorUuid: string;
  setorUuid: string;
  unidadeFaturamentoUuid: string;
  unidadeAtendimentoUuid: string;
  leitoUuid: string | null;
  tipo: string;
  tipoCobranca: string;
  convenioUuid: string | null;
  planoUuid: string | null;
  numeroCarteirinha: string | null;
  numeroGuiaOperadora: string | null;
  senhaAutorizacao: string | null;
  classificacaoRisco: string | null;
  classificacaoRiscoEm: string | null;
  cidPrincipal: string | null;
  cidsSecundarios: string[] | null;
  motivoAtendimento: string | null;
  status: string;
  tipoAlta: string | null;
  dataHoraEntrada: string;
  dataHoraSaida: string | null;
  agendamentoUuid: string | null;
  atendimentoOrigemUuid: string | null;
  contaUuid: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
  versao: number;
}

export interface TriagemResponse {
  uuid: string;
  atendimentoUuid: string;
  classificacao: string;
  protocolo: string;
  queixaPrincipal: string;
  paSistolica: number | null;
  paDiastolica: number | null;
  fc: number | null;
  fr: number | null;
  temperatura: number | null;
  satO2: number | null;
  glicemia: number | null;
  pesoKg: number | null;
  alturaCm: number | null;
  dorEva: number | null;
  observacao: string | null;
  triagemEm: string;
  triagemPorUuid: string | null;
  createdAt: string;
}

export interface FilaItem {
  uuid: string;
  numeroAtendimento: string;
  pacienteUuid: string;
  pacienteNome: string;
  classificacaoRisco: string | null;
  status: string;
  dataHoraEntrada: string;
  tempoEsperaSegundos: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
