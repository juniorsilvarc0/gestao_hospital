/**
 * DTOs de resposta — leituras do módulo Glosas.
 */
import type { GlosaOrigem, GlosaStatus } from '../domain/glosa';
import type { MotivoSugerido } from '../domain/motivo-inferencer';

export interface GlosaResponse {
  uuid: string;
  contaUuid: string;
  contaItemUuid: string | null;
  guiaTissUuid: string | null;
  convenioUuid: string;
  motivo: string;
  codigoGlosaTiss: string | null;
  motivoSugerido: MotivoSugerido | null;
  valorGlosado: string;
  dataGlosa: string;
  origem: GlosaOrigem;
  prazoRecurso: string | null;
  prazoVencido: boolean;
  diasAtePrazo: number | null;
  recurso: string | null;
  dataRecurso: string | null;
  recursoDocumentoUrl: string | null;
  recursoPorUuid: string | null;
  status: GlosaStatus;
  valorRevertido: string;
  dataRespostaRecurso: string | null;
  motivoResposta: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ListGlosasResponse {
  data: GlosaResponse[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ImportarGlosasTissResponse {
  total: number;
  importadas: number;
  comAlerta: Array<{ linha: number; mensagem: string }>;
  glosas: GlosaResponse[];
}

export interface DashboardPrazoBucket {
  /** Dias até o vencimento. 7, 3 e 0 (D-7, D-3, D-0). */
  dias: number;
  quantidade: number;
  glosaUuids: string[];
}

export interface DashboardResponse {
  totalRecebidas: number;
  totalEmRecurso: number;
  totalRevertidas: number;
  totalAcatadas: number;
  totalPerdaDefinitiva: number;
  valorTotalGlosado: string;
  valorTotalRevertido: string;
  taxaReversao: number;
  prazosVencendoEmDias: DashboardPrazoBucket[];
}
