/**
 * Response shapes para o módulo de Tabelas de Preços.
 */
export interface TabelaPrecosResponse {
  id: string;
  codigo: string;
  nome: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  versao: number;
  ativa: boolean;
  createdAt: string;
  itensCount?: number;
}

export interface TabelaPrecosItemResponse {
  id: string;
  procedimentoId: string;
  procedimentoCodigoTuss: string;
  procedimentoNome: string;
  valor: string;
  valorFilme: string | null;
  porteAnestesico: string | null;
  tempoMinutos: number | null;
  custoOperacional: string | null;
  observacao: string | null;
}

export interface ResolvePrecoResponse {
  valor: string;
  fonte: 'PLANO' | 'CONVENIO' | 'DEFAULT' | 'REFERENCIA';
  tabelaId: string | null;
  tabelaCodigo: string | null;
  procedimentoId: string;
  procedimentoCodigoTuss: string;
  dataReferencia: string;
}
