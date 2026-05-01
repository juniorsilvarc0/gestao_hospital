/**
 * Tipos do bounded context Atendimentos / Triagem (Trilha A da Fase 5).
 *
 * Espelha o schema do DB.md §7.3 (`atendimentos`) e a `triagens`/`sinais_vitais`
 * (parte de `evolucoes` JSONB) — porém o front trabalha com um shape de
 * triagem dedicado para a UI (sem framework de PEP).
 *
 * Convenções:
 *  - `uuid` é o identificador público externo do atendimento.
 *  - Datas/horas: ISO-8601 com timezone.
 *  - Sinais vitais: chaves alinhadas ao DB (`pa_sistolica`, `pa_diastolica`,
 *    `fc`, `fr`, `temp`, `sat_o2`, `peso`, `altura`, `glicemia`).
 */

export type AtendimentoTipo =
  | 'CONSULTA'
  | 'EXAME'
  | 'INTERNACAO'
  | 'CIRURGIA'
  | 'PRONTO_ATENDIMENTO'
  | 'TELECONSULTA'
  | 'OBSERVACAO';

export type AtendimentoStatus =
  | 'AGENDADO'
  | 'EM_ESPERA'
  | 'EM_TRIAGEM'
  | 'EM_ATENDIMENTO'
  | 'INTERNADO'
  | 'ALTA'
  | 'CANCELADO'
  | 'NAO_COMPARECEU';

export type ClassificacaoRisco =
  | 'VERMELHO'
  | 'LARANJA'
  | 'AMARELO'
  | 'VERDE'
  | 'AZUL';

export type TipoAlta =
  | 'ALTA_MEDICA'
  | 'ALTA_PEDIDO'
  | 'TRANSFERENCIA'
  | 'EVASAO'
  | 'OBITO';

export type TipoCobranca = 'PARTICULAR' | 'CONVENIO' | 'SUS';

export interface SinaisVitais {
  paSistolica?: number | null;
  paDiastolica?: number | null;
  fc?: number | null;
  fr?: number | null;
  temp?: number | null;
  satO2?: number | null;
  peso?: number | null;
  altura?: number | null;
  glicemia?: number | null;
  evaDor?: number | null;
}

export interface Triagem {
  uuid: string;
  atendimentoUuid: string;
  classificacao: ClassificacaoRisco;
  queixaPrincipal: string;
  sinaisVitais: SinaisVitais;
  observacao?: string | null;
  registradoEm: string;
  registradoPor?: string | null;
  registradoPorNome?: string | null;
}

export interface TriagemCreateInput {
  classificacao: ClassificacaoRisco;
  queixaPrincipal: string;
  sinaisVitais: SinaisVitais;
  observacao?: string;
  /** Override de validação fisiológica (RN-PEP-04). */
  valoresConfirmados?: boolean;
}

export interface AtendimentoResumo {
  uuid: string;
  numero: string;
  pacienteUuid: string;
  pacienteNome: string;
  pacienteIdade?: number | null;
  pacienteSexo?: 'M' | 'F' | 'INDETERMINADO' | null;
  prestadorUuid?: string | null;
  prestadorNome?: string | null;
  setorUuid: string;
  setorNome?: string | null;
  unidadeAtendimentoUuid?: string | null;
  unidadeFaturamentoUuid?: string | null;
  tipo: AtendimentoTipo;
  tipoCobranca: TipoCobranca;
  status: AtendimentoStatus;
  classificacaoRisco?: ClassificacaoRisco | null;
  classificacaoRiscoEm?: string | null;
  dataHoraEntrada: string;
  dataHoraSaida?: string | null;
  agendamentoUuid?: string | null;
  motivoAtendimento?: string | null;
}

export interface AtendimentoDetalhe extends AtendimentoResumo {
  pacienteCpf?: string | null;
  pacienteCns?: string | null;
  pacienteFotoUrl?: string | null;
  pacienteAlergias?: { substancia: string; gravidade?: string | null }[];
  pacienteComorbidades?: { descricao: string; cid?: string | null }[];
  convenioUuid?: string | null;
  convenioNome?: string | null;
  planoUuid?: string | null;
  planoNome?: string | null;
  numeroCarteirinha?: string | null;
  numeroGuiaOperadora?: string | null;
  senhaAutorizacao?: string | null;
  cidPrincipal?: string | null;
  cidsSecundarios?: string[] | null;
  tipoAlta?: TipoAlta | null;
  observacao?: string | null;
  leitoUuid?: string | null;
  leitoCodigo?: string | null;
  triagens?: Triagem[];
  versao?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface AtendimentoCreateInput {
  pacienteUuid: string;
  prestadorUuid: string;
  setorUuid: string;
  unidadeAtendimentoUuid: string;
  unidadeFaturamentoUuid: string;
  tipo: AtendimentoTipo;
  tipoCobranca: TipoCobranca;
  motivoAtendimento?: string;
  agendamentoUuid?: string;
  /** Quando `tipoCobranca = CONVENIO`. */
  pacienteConvenioUuid?: string;
  convenioUuid?: string;
  planoUuid?: string;
  numeroCarteirinha?: string;
  numeroGuiaOperadora?: string;
  senhaAutorizacao?: string;
}

export interface InternarInput {
  leitoUuid: string;
  leitoVersao: number;
  observacao?: string;
}

export interface TransferirInput {
  setorUuid?: string;
  leitoUuid?: string;
  leitoVersao?: number;
  externa?: boolean;
  destinoExterno?: string;
  motivo: string;
}

export interface AltaInput {
  tipoAlta: TipoAlta;
  cidPrincipal?: string;
  cidsSecundarios?: string[];
  resumo?: string;
}

export interface ListAtendimentosParams {
  data?: string; // YYYY-MM-DD
  setorUuid?: string;
  status?: AtendimentoStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAtendimentos {
  data: AtendimentoResumo[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ElegibilidadeResultado {
  elegivel: boolean;
  status: string;
  mensagem?: string;
  validade?: string | null;
  consultadoEm: string;
  protocolo?: string;
}

export interface ElegibilidadeInput {
  convenioUuid: string;
  numeroCarteirinha: string;
  pacienteUuid?: string;
  procedimentoUuid?: string;
}

/** Cores Manchester e tempos-alvo para atendimento (RN-ATE-04/05). */
export interface ManchesterCor {
  cor: ClassificacaoRisco;
  label: string;
  /** Minutos máximos de espera (referência protocolo Manchester). */
  tempoAlvoMin: number | null;
  /** Tailwind background classes. */
  bg: string;
  /** Tailwind border classes. */
  border: string;
  /** Tailwind text color classes. */
  text: string;
}

export const MANCHESTER_CORES: ManchesterCor[] = [
  {
    cor: 'VERMELHO',
    label: 'Emergência',
    tempoAlvoMin: 0,
    bg: 'bg-red-600',
    border: 'border-red-700',
    text: 'text-white',
  },
  {
    cor: 'LARANJA',
    label: 'Muito urgente',
    tempoAlvoMin: 10,
    bg: 'bg-orange-500',
    border: 'border-orange-600',
    text: 'text-white',
  },
  {
    cor: 'AMARELO',
    label: 'Urgente',
    tempoAlvoMin: 60,
    bg: 'bg-yellow-400',
    border: 'border-yellow-500',
    text: 'text-yellow-900',
  },
  {
    cor: 'VERDE',
    label: 'Pouco urgente',
    tempoAlvoMin: 120,
    bg: 'bg-green-500',
    border: 'border-green-600',
    text: 'text-white',
  },
  {
    cor: 'AZUL',
    label: 'Não urgente',
    tempoAlvoMin: 240,
    bg: 'bg-blue-500',
    border: 'border-blue-600',
    text: 'text-white',
  },
];

/** Faixas fisiológicas — RN-PEP-04. */
export const FAIXAS_VITAIS: Record<
  keyof Pick<
    SinaisVitais,
    | 'paSistolica'
    | 'paDiastolica'
    | 'fc'
    | 'fr'
    | 'temp'
    | 'satO2'
    | 'glicemia'
  >,
  { min: number; max: number; unidade: string }
> = {
  paSistolica: { min: 50, max: 280, unidade: 'mmHg' },
  paDiastolica: { min: 30, max: 180, unidade: 'mmHg' },
  fc: { min: 30, max: 220, unidade: 'bpm' },
  fr: { min: 5, max: 60, unidade: 'irpm' },
  temp: { min: 32, max: 42, unidade: '°C' },
  satO2: { min: 50, max: 100, unidade: '%' },
  glicemia: { min: 30, max: 600, unidade: 'mg/dL' },
};
