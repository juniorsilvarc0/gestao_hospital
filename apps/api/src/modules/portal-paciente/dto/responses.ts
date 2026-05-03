/**
 * DTOs de resposta — leituras do portal do paciente.
 *
 * Convenção:
 *   - Identificadores externos sempre como `uuid` (string).
 *   - Datas/timestamps sempre ISO-8601 string.
 *   - Valores monetários como string (preserva DECIMAL).
 */
import type { ConsentimentoFinalidade } from '../domain/consentimento';

export interface MePacienteResponse {
  paciente: {
    uuid: string;
    nome: string;
    dataNascimento: string | null;
    sexo: string | null;
  };
  flags: {
    consentimentosPendentes: number;
    proximasConsultasCount: number;
    examesNovosCount: number;
    notificacoesNaoLidasCount: number;
  };
}

export interface PortalAgendamentoResumo {
  uuid: string;
  inicio: string;
  fim: string;
  tipo: string;
  status: string;
  recursoUuid: string;
  procedimentoUuid: string | null;
  convenioUuid: string | null;
  observacao: string | null;
  temTeleconsulta: boolean;
}

export interface PortalAgendamentosResponse {
  proximos: PortalAgendamentoResumo[];
  historico: PortalAgendamentoResumo[];
}

export interface PortalExameResumo {
  solicitacaoUuid: string;
  itemUuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  status: string;
  dataSolicitacao: string;
  resultadoUuid: string | null;
  laudoDisponivel: boolean;
}

export interface PortalExamesListResponse {
  data: PortalExameResumo[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PortalResultadoExameResponse {
  uuid: string;
  solicitacaoUuid: string;
  procedimentoUuid: string;
  procedimentoNome: string | null;
  status: string;
  dataLaudo: string | null;
  laudoTexto: string | null;
  laudoPdfUrl: string | null;
  imagensUrls: string[];
  assinado: boolean;
}

export interface PortalReceitaResumo {
  uuid: string;
  tipo: string;
  emissorNome: string | null;
  dataEmissao: string;
  pdfUrl: string | null;
  assinada: boolean;
}

export interface PortalReceitasListResponse {
  data: PortalReceitaResumo[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PortalTeleconsultaLinkResponse {
  url: string;
  expiraEm: string;
}

export interface PortalContaResumo {
  uuid: string;
  numeroConta: string;
  status: string;
  tipoCobranca: string;
  dataAbertura: string;
  dataFechamento: string | null;
  valorTotal: string;
  valorPago: string;
  valorLiquido: string;
}

export interface PortalContasListResponse {
  data: PortalContaResumo[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PortalConsentimentoResponse {
  uuid: string;
  finalidade: ConsentimentoFinalidade;
  versaoTermo: string;
  aceito: boolean;
  dataDecisao: string;
  dataRevogacao: string | null;
  motivoRevogacao: string | null;
  ativo: boolean;
}

export interface PortalConsentimentosListResponse {
  data: PortalConsentimentoResponse[];
}

export interface PortalNotificacaoResponse {
  uuid: string;
  canal: string;
  assunto: string | null;
  conteudo: string;
  status: string;
  dataEnvio: string | null;
  dataEntrega: string | null;
  dataLeitura: string | null;
  templateCodigo: string | null;
  origemEvento: string | null;
  createdAt: string;
}

export interface PortalNotificacoesListResponse {
  data: PortalNotificacaoResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
