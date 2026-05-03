/**
 * DTOs de resposta — leituras do módulo CCIH.
 */
import type { AntibiogramaEntry } from '../domain/antibiograma';
import type { CcihCasoStatus, CcihOrigemInfeccao } from '../domain/caso';

export interface CasoCcihResponse {
  uuid: string;
  pacienteUuid: string;
  pacienteNome: string | null;
  atendimentoUuid: string;
  setorUuid: string;
  setorNome: string | null;
  leitoUuid: string | null;
  leitoIdentificacao: string | null;
  dataDiagnostico: string;
  topografia: string | null;
  cid: string | null;
  microorganismo: string | null;
  culturaOrigem: string | null;
  resistencia: AntibiogramaEntry[] | null;
  origemInfeccao: CcihOrigemInfeccao;
  notificacaoCompulsoria: boolean;
  dataNotificacao: string | null;
  /** `true` se o CID está na lista compulsória — sugestão para o operador. */
  cidCompulsorioSugerido: boolean;
  resultado: string | null;
  status: CcihCasoStatus;
  observacao: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListCasosCcihResponse {
  data: CasoCcihResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// ────────── Painel epidemiológico ──────────

export interface PainelTaxaSetor {
  setorUuid: string;
  setorNome: string;
  qtdCasos: number;
  pacienteDias: number;
  taxaPor1000: number;
}

export interface PainelTopografia {
  topografia: string;
  qtd: number;
  pct: number;
}

export interface PainelMicroorganismo {
  nome: string;
  qtd: number;
}

export interface PainelResistencia {
  antibiotico: string;
  totalTestes: number;
  totalResistente: number;
  pctResistente: number;
}

export interface PainelCcihResponse {
  competencia: string;
  totalCasos: number;
  casosAbertos: number;
  casosEncerrados: number;
  taxaPorSetor: PainelTaxaSetor[];
  topografias: PainelTopografia[];
  microorganismos: PainelMicroorganismo[];
  resistencias: PainelResistencia[];
  porOrigem: {
    COMUNITARIA: number;
    HOSPITALAR: number;
    INDETERMINADA: number;
  };
  notificacoesCompulsorias: number;
}

// ────────── Contatos de risco ──────────

export interface ContatoRiscoEntry {
  pacienteUuid: string;
  pacienteNome: string | null;
  atendimentoUuid: string;
  setorUuid: string | null;
  setorNome: string | null;
  leitoUuid: string | null;
  leitoIdentificacao: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  motivo: 'MESMO_SETOR' | 'MESMO_LEITO';
}

export interface ContatosRiscoResponse {
  casoUuid: string;
  janelaInicio: string;
  janelaFim: string;
  contatos: ContatoRiscoEntry[];
}
