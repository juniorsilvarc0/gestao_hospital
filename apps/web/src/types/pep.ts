/**
 * Tipos do bounded context PEP — Prontuário Eletrônico (Fase 6).
 *
 * Espelha contratos do backend (Trilhas A/B):
 *   /v1/atendimentos/:uuid/timeline
 *   /v1/atendimentos/:uuid/evolucoes
 *   /v1/evolucoes/:uuid
 *   /v1/evolucoes/:uuid/assinar
 *   /v1/atendimentos/:uuid/prescricoes
 *   /v1/prescricoes/:uuid
 *   /v1/prescricoes/:uuid/assinar
 *   /v1/atendimentos/:uuid/sinais-vitais
 *   /v1/atendimentos/:uuid/documentos
 *   /v1/documentos/:uuid (PDF preview)
 *   /v1/laudos
 *   /v1/laudos/:uuid (laudar/assinar)
 *
 * Convenções:
 *  - Datas/horas: ISO-8601 com timezone.
 *  - Conteúdo TipTap: JSON do ProseMirror; HTML em `conteudoHtml` é cache.
 */

import type { SinaisVitais } from '@/types/atendimentos';

/* ------------------------------------------------------------------ */
/* Finalidade LGPD                                                     */
/* ------------------------------------------------------------------ */
export type FinalidadeAcesso =
  | 'CONSULTA'
  | 'TRIAGEM'
  | 'EVOLUCAO'
  | 'PRESCRICAO'
  | 'EXAME'
  | 'AUDITORIA'
  | 'OUTRO';

export const FINALIDADES_ACESSO: { value: FinalidadeAcesso; label: string }[] =
  [
    { value: 'CONSULTA', label: 'Consulta clínica' },
    { value: 'TRIAGEM', label: 'Triagem' },
    { value: 'EVOLUCAO', label: 'Evolução' },
    { value: 'PRESCRICAO', label: 'Prescrição / dispensação' },
    { value: 'EXAME', label: 'Exame / laudo' },
    { value: 'AUDITORIA', label: 'Auditoria' },
    { value: 'OUTRO', label: 'Outro (justificar)' },
  ];

/* ------------------------------------------------------------------ */
/* Evoluções                                                           */
/* ------------------------------------------------------------------ */
export type TipoProfissionalEvolucao =
  | 'MEDICO'
  | 'ENFERMEIRO'
  | 'TECNICO_ENFERMAGEM'
  | 'FISIOTERAPEUTA'
  | 'NUTRICIONISTA'
  | 'PSICOLOGO'
  | 'FONOAUDIOLOGO'
  | 'FARMACEUTICO'
  | 'OUTRO';

export type StatusEvolucao = 'RASCUNHO' | 'ASSINADA' | 'RETIFICADA';

export interface AssinaturaDigital {
  certNome?: string;
  certCpf?: string;
  certEmissor?: string;
  hashConteudo: string;
  timestamp: string;
}

export interface Evolucao {
  uuid: string;
  atendimentoUuid: string;
  tipoProfissional: TipoProfissionalEvolucao;
  /** ProseMirror / TipTap JSON. */
  conteudo: unknown;
  conteudoHtml?: string | null;
  status: StatusEvolucao;
  dataHoraEvento: string;
  registradoPor?: string | null;
  registradoPorNome?: string | null;
  assinadaEm?: string | null;
  assinaturaDigital?: AssinaturaDigital | null;
  versaoAnteriorUuid?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface EvolucaoCreateInput {
  tipoProfissional: TipoProfissionalEvolucao;
  conteudo: unknown;
  conteudoHtml?: string;
  dataHoraEvento?: string;
}

export interface EvolucaoUpdateInput {
  conteudo?: unknown;
  conteudoHtml?: string;
}

export interface AssinarEvolucaoInput {
  /** Placeholder Fase 13 (ICP-Brasil A1 PIN). */
  pin?: string;
  confirmacoes: {
    leuConteudo: boolean;
    confirmaAutoria: boolean;
    cienteImutabilidade: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* Prescrições                                                         */
/* ------------------------------------------------------------------ */
export type TipoItemPrescricao =
  | 'MEDICAMENTO'
  | 'CUIDADO'
  | 'DIETA'
  | 'PROCEDIMENTO'
  | 'EXAME';

export type StatusPrescricao =
  | 'RASCUNHO'
  | 'AGUARDANDO_ANALISE'
  | 'ATIVA'
  | 'APROVADA_RESSALVAS'
  | 'RECUSADA_FARMACIA'
  | 'SUSPENSA'
  | 'ENCERRADA';

export type SeveridadeAlerta = 'LEVE' | 'MODERADA' | 'GRAVE';

export interface AlertaPrescricao {
  /** ALERGIA | INTERACAO | DOSE | OUTRO. */
  tipo: 'ALERGIA' | 'INTERACAO' | 'DOSE' | 'OUTRO';
  severidade: SeveridadeAlerta;
  mensagem: string;
  /** Item afetado (índice no array `itens`). */
  itemIndex?: number;
  /** Princípio ativo / código de referência. */
  referencia?: string | null;
}

export interface PrescricaoOverride {
  alertaTipo: AlertaPrescricao['tipo'];
  alertaReferencia?: string | null;
  justificativa: string;
}

export interface ItemPrescricao {
  uuid?: string;
  tipo: TipoItemPrescricao;
  procedimentoUuid?: string | null;
  procedimentoCodigo?: string | null;
  procedimentoDescricao: string;
  /** Dose do item (DECIMAL — armazenamos como string para evitar float). */
  dose?: string | null;
  unidadeDose?: string | null;
  via?: string | null;
  frequencia?: string | null;
  duracao?: string | null;
  horarios?: string[];
  observacao?: string | null;
  seNecessario?: boolean;
  urgente?: boolean;
}

export interface Prescricao {
  uuid: string;
  atendimentoUuid: string;
  status: StatusPrescricao;
  validadeInicio: string;
  validadeFim?: string | null;
  itens: ItemPrescricao[];
  alertas?: AlertaPrescricao[];
  overrides?: PrescricaoOverride[];
  registradoPor?: string | null;
  registradoPorNome?: string | null;
  assinadaEm?: string | null;
  assinaturaDigital?: AssinaturaDigital | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface PrescricaoCreateInput {
  validadeInicio: string;
  validadeFim?: string;
  itens: ItemPrescricao[];
  /** Quando reenviado após alertas, marca quais foram justificados. */
  overrides?: PrescricaoOverride[];
  /** Quando `true`, backend valida apenas (não persiste como ATIVA). */
  apenasValidar?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sinais vitais                                                       */
/* ------------------------------------------------------------------ */
export interface SinaisVitaisCreateInput {
  sinaisVitais: SinaisVitais;
  observacao?: string;
  valoresConfirmados?: boolean;
  /** Default: now() do backend. */
  dataHoraAfericao?: string;
}

export interface SinaisVitaisRegistro {
  uuid: string;
  atendimentoUuid: string;
  sinaisVitais: SinaisVitais;
  observacao?: string | null;
  valoresConfirmados?: boolean | null;
  dataHoraAfericao: string;
  registradoPorNome?: string | null;
}

/* ------------------------------------------------------------------ */
/* Documentos emitidos                                                 */
/* ------------------------------------------------------------------ */
export type TipoDocumento =
  | 'ATESTADO'
  | 'RECEITA_SIMPLES'
  | 'RECEITA_CONTROLADO'
  | 'DECLARACAO'
  | 'ENCAMINHAMENTO'
  | 'RESUMO_ALTA';

export interface DocumentoMedicamento {
  procedimentoUuid?: string | null;
  descricao: string;
  dose: string;
  via: string;
  frequencia: string;
  duracao?: string;
  observacao?: string;
}

export interface DocumentoAtestadoConteudo {
  tipo: 'ATESTADO';
  cidPrincipal: string;
  diasAfastamento: number;
  observacao?: string;
}

export interface DocumentoReceitaSimplesConteudo {
  tipo: 'RECEITA_SIMPLES';
  medicamentos: DocumentoMedicamento[];
  observacao?: string;
}

export interface DocumentoReceitaControladoConteudo {
  tipo: 'RECEITA_CONTROLADO';
  numeroSequencial?: string;
  tarja: 'AMARELA' | 'AZUL' | 'BRANCA' | 'PRETA';
  medicamentos: DocumentoMedicamento[];
  observacao?: string;
}

export interface DocumentoDeclaracaoConteudo {
  tipo: 'DECLARACAO';
  finalidade: string;
  texto: string;
}

export interface DocumentoEncaminhamentoConteudo {
  tipo: 'ENCAMINHAMENTO';
  especialidadeDestino: string;
  motivo: string;
  cid?: string;
}

export interface DocumentoResumoAltaConteudo {
  tipo: 'RESUMO_ALTA';
  cidsPrincipais: string[];
  procedimentosRealizados: string[];
  prescricaoAlta: DocumentoMedicamento[];
  recomendacoes: string;
}

export type DocumentoConteudo =
  | DocumentoAtestadoConteudo
  | DocumentoReceitaSimplesConteudo
  | DocumentoReceitaControladoConteudo
  | DocumentoDeclaracaoConteudo
  | DocumentoEncaminhamentoConteudo
  | DocumentoResumoAltaConteudo;

export interface DocumentoEmitido {
  uuid: string;
  atendimentoUuid: string;
  tipo: TipoDocumento;
  conteudo: DocumentoConteudo;
  status: 'RASCUNHO' | 'ASSINADO';
  emitidoEm: string;
  emitidoPorNome?: string | null;
  assinadaEm?: string | null;
  assinaturaDigital?: AssinaturaDigital | null;
  pdfUrl?: string | null;
}

export interface DocumentoCreateInput {
  tipo: TipoDocumento;
  conteudo: DocumentoConteudo;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */
export type TimelineEventoTipo =
  | 'EVOLUCAO'
  | 'PRESCRICAO'
  | 'SINAIS_VITAIS'
  | 'EXAME_SOLICITADO'
  | 'EXAME_LAUDADO'
  | 'DOCUMENTO';

export interface TimelineEvento {
  uuid: string;
  atendimentoUuid: string;
  tipo: TimelineEventoTipo;
  dataHoraEvento: string;
  titulo: string;
  resumo?: string | null;
  autorNome?: string | null;
  status?: string | null;
  /** Payload referência (uuid do recurso). */
  refUuid: string;
  /** Para evolucoes: foi assinada? */
  assinada?: boolean;
}

/* ------------------------------------------------------------------ */
/* Resumo clínico (coluna direita)                                     */
/* ------------------------------------------------------------------ */
export interface ResumoClinico {
  ultimosSinaisVitais?: SinaisVitaisRegistro | null;
  alergias: { substancia: string; gravidade?: string | null }[];
  cuidadosAtivos: { descricao: string; frequencia?: string | null }[];
  examesPendentes: { uuid: string; descricao: string; solicitadoEm: string }[];
}

/* ------------------------------------------------------------------ */
/* Catálogo de procedimentos                                           */
/* ------------------------------------------------------------------ */
export interface ProcedimentoCatalogo {
  uuid: string;
  codigo: string;
  descricao: string;
  /** Tabela origem (TUSS, CBHPM, AMB, SUS, INTERNO). */
  tabela?: string;
  /** Quando aplicável (medicamentos): princípio ativo. */
  principioAtivo?: string | null;
  /** Para medicamentos. */
  unidadeDose?: string | null;
}

/* ------------------------------------------------------------------ */
/* Laudos                                                              */
/* ------------------------------------------------------------------ */
export type ModalidadeExame =
  | 'LAB'
  | 'IMAGEM'
  | 'ANATOMIA_PATOLOGICA'
  | 'OUTRO';

export type StatusLaudo =
  | 'PENDENTE'
  | 'EM_REVISAO'
  | 'FINAL'
  | 'CANCELADO';

export interface LaudoResumo {
  uuid: string;
  atendimentoUuid: string;
  pacienteNome: string;
  modalidade: ModalidadeExame;
  estudo: string;
  dataExame: string;
  status: StatusLaudo;
  medicoUuid?: string | null;
  medicoNome?: string | null;
}

export interface LaudoDetalhe extends LaudoResumo {
  /** TipTap JSON. */
  conteudo?: unknown;
  conteudoHtml?: string;
  /** Para resultados estruturados de lab — chaves dinâmicas. */
  resultadoEstruturado?: Record<string, unknown> | null;
  pacienteUuid?: string | null;
  /** Imagens DICOM/anexos. */
  anexos?: { url: string; descricao: string }[];
}

export interface ListarLaudosParams {
  modalidade?: ModalidadeExame;
  status?: StatusLaudo;
  data?: string;
  medicoUuid?: string;
  page?: number;
  pageSize?: number;
}
