/**
 * DTOs de resposta — leituras do módulo Visitantes.
 *
 * Atenção LGPD: NUNCA retornamos `cpf_hash` ou CPF completo. Apenas
 * `cpfUltimos4` para conferência humana ("…-1234").
 */

export interface VisitanteResponse {
  uuid: string;
  nome: string;
  cpfUltimos4: string | null;
  documentoFotoUrl: string | null;
  bloqueado: boolean;
  motivoBloqueio: string | null;
  bloqueadoEm: string | null;
  bloqueadoPorUuid: string | null;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListVisitantesResponse {
  data: VisitanteResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface VisitaResponse {
  uuid: string;
  visitanteUuid: string;
  visitanteNome: string;
  pacienteUuid: string;
  pacienteNome: string;
  leitoUuid: string | null;
  leitoCodigo: string | null;
  setorUuid: string | null;
  setorNome: string | null;
  porteiroUuid: string | null;
  dataEntrada: string;
  dataSaida: string | null;
  ativa: boolean;
  observacao: string | null;
  createdAt: string;
}

export interface ListVisitasResponse {
  data: VisitaResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
