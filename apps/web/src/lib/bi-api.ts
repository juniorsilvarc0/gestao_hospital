/**
 * Wrappers tipados para os endpoints de BI / Indicadores (Fase 12 — R-C).
 *
 * Endpoints (já entregues por R-A + R-B):
 *
 *   POST  /v1/bi/refresh                                    → enfileira
 *   GET   /v1/bi/refresh/status                             → últimas execuções
 *   GET   /v1/bi/refresh/log?page=&pageSize=&view=&status=  → log paginado
 *   GET   /v1/bi/dashboards/executivo?competencia=YYYY-MM
 *   GET   /v1/bi/dashboards/operacional?dataInicio=&dataFim=
 *
 *   GET   /v1/indicadores/assistenciais/taxa-ocupacao
 *   GET   /v1/indicadores/assistenciais/permanencia
 *   GET   /v1/indicadores/assistenciais/mortalidade
 *   GET   /v1/indicadores/assistenciais/iras
 *   GET   /v1/indicadores/assistenciais/dashboard
 *
 *   GET   /v1/indicadores/financeiros/faturamento
 *   GET   /v1/indicadores/financeiros/glosas
 *   GET   /v1/indicadores/financeiros/repasse
 *   GET   /v1/indicadores/financeiros/dashboard
 *
 *   GET   /v1/indicadores/operacionais/no-show
 *   GET   /v1/indicadores/operacionais/classificacao-risco
 *   GET   /v1/indicadores/operacionais/cirurgias-sala
 *   GET   /v1/indicadores/operacionais/dashboard
 *
 *   POST  /v1/bi/export?formato=csv|xlsx&view=mv_xxx
 *         body { filtros, colunas? } → response binário (Blob)
 *
 * O wrapper usa o `api-client` (fetch-based) para GET/POST JSON; para o
 * export, usa `fetch` direto via helper `binaryRequest` que injeta o
 * Authorization Bearer e devolve um `Blob`.
 *
 * Observações importantes:
 *  - As respostas da API podem vir envelopadas em `{ data: ... }` (padrão
 *    NestJS interceptor do projeto) ou cruas. Usamos o helper `unwrap`
 *    como nos demais clientes (glosas-api, repasse-api).
 *  - Os tipos de resposta usados aqui são intencionalmente flexíveis
 *    (`Record<string, unknown>` quando o schema do backend ainda não
 *    está consolidado para o frontend) — preferimos não mascarar erros
 *    forçando casts inadequados.
 */
import { apiGet, apiPost, ApiError } from '@/lib/api-client';
import { getAuthSnapshot } from '@/stores/auth-store';
import type {
  BiRefreshExecucao,
  BiView,
  ExportFormato,
  ExportInput,
  PaginatedBiRefreshLog,
} from '@/types/bi';

interface Envelope<T> {
  data: T;
}

function unwrap<T>(response: T | Envelope<T>): T {
  if (
    response !== null &&
    typeof response === 'object' &&
    'data' in (response as object) &&
    Object.keys(response as object).length <= 2
  ) {
    return (response as Envelope<T>).data;
  }
  return response as T;
}

function buildQuery(params: object): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.set(key, String(value));
    }
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

/* ============================== Refresh ============================== */

/**
 * Resposta de POST /v1/bi/refresh: a API retorna o relatório completo
 * (RefreshReportResponse — síncrono em P0). Mantemos como Record solto
 * para permitir evolução do schema sem quebrar o frontend.
 */
export interface ForceRefreshReport {
  iniciadoEm?: string;
  concluidoEm?: string;
  total?: number;
  ok?: number;
  erro?: number;
  triggerOrigem?: string;
  views?: Array<{
    viewName: string;
    status: 'OK' | 'ERRO';
    duracaoMs: number;
    linhas: number | null;
    erro: string | null;
  }>;
}

export async function forceRefresh(
  body: { views?: string[] } = {},
): Promise<ForceRefreshReport> {
  const response = await apiPost<ForceRefreshReport | Envelope<ForceRefreshReport>>(
    `/bi/refresh`,
    body,
    { idempotent: true },
  );
  return unwrap(response);
}

export interface RefreshStatusUltimaExecucao {
  iniciadoEm: string | null;
  statusGeral: 'OK' | 'PARCIAL' | 'ERRO' | 'NUNCA';
  total: number;
  ok: number;
  erro: number;
}

export interface RefreshStatusResponse {
  ultimaExecucao: RefreshStatusUltimaExecucao;
  ultimasN: BiRefreshExecucao[];
}

export async function getRefreshStatus(): Promise<RefreshStatusResponse> {
  const response = await apiGet<
    RefreshStatusResponse | Envelope<RefreshStatusResponse>
  >(`/bi/refresh/status`);
  return unwrap(response);
}

export interface ListRefreshLogParams {
  page?: number;
  pageSize?: number;
  view?: string;
  status?: string;
}

export async function listRefreshLog(
  params: ListRefreshLogParams = {},
): Promise<PaginatedBiRefreshLog> {
  return apiGet<PaginatedBiRefreshLog>(
    `/bi/refresh/log${buildQuery(params)}`,
  );
}

/* ============================== Dashboards ============================== */

export interface GetDashboardExecutivoParams {
  competencia: string; // YYYY-MM
}

export async function getDashboardExecutivo(
  params: GetDashboardExecutivoParams,
): Promise<Record<string, unknown>> {
  const response = await apiGet<Record<string, unknown>>(
    `/bi/dashboards/executivo${buildQuery(params)}`,
  );
  return unwrap(response as Record<string, unknown> | Envelope<Record<string, unknown>>);
}

export interface GetDashboardOperacionalParams {
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
}

export async function getDashboardOperacional(
  params: GetDashboardOperacionalParams,
): Promise<Record<string, unknown>> {
  const response = await apiGet<Record<string, unknown>>(
    `/bi/dashboards/operacional${buildQuery(params)}`,
  );
  return unwrap(response as Record<string, unknown> | Envelope<Record<string, unknown>>);
}

/* ===================== Indicadores Assistenciais ===================== */

export interface TaxaOcupacaoParams {
  dia?: string;
  setorUuid?: string;
}

export async function getIndicadorTaxaOcupacao(
  params: TaxaOcupacaoParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/assistenciais/taxa-ocupacao${buildQuery(params)}`,
    ),
  );
}

export interface CompetenciaRangeParams {
  competenciaInicio?: string;
  competenciaFim?: string;
  setorUuid?: string;
}

export async function getIndicadorPermanencia(
  params: CompetenciaRangeParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/assistenciais/permanencia${buildQuery(params)}`,
    ),
  );
}

export async function getIndicadorMortalidade(
  params: CompetenciaRangeParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/assistenciais/mortalidade${buildQuery(params)}`,
    ),
  );
}

export async function getIndicadorIras(
  params: CompetenciaRangeParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/assistenciais/iras${buildQuery(params)}`,
    ),
  );
}

export interface DashboardAssistencialParams {
  competencia: string;
}

export async function getDashboardAssistencial(
  params: DashboardAssistencialParams,
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/assistenciais/dashboard${buildQuery(params)}`,
    ),
  );
}

/* ====================== Indicadores Financeiros ====================== */

export interface FaturamentoParams extends CompetenciaRangeParams {
  convenioUuid?: string;
}

export async function getIndicadorFaturamento(
  params: FaturamentoParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/financeiros/faturamento${buildQuery(params)}`,
    ),
  );
}

export interface GlosasFinanceiroParams extends CompetenciaRangeParams {
  convenioUuid?: string;
  status?: string;
}

export async function getIndicadorGlosas(
  params: GlosasFinanceiroParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/financeiros/glosas${buildQuery(params)}`,
    ),
  );
}

export interface RepasseFinanceiroParams extends CompetenciaRangeParams {
  prestadorUuid?: string;
}

export async function getIndicadorRepasse(
  params: RepasseFinanceiroParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/financeiros/repasse${buildQuery(params)}`,
    ),
  );
}

export interface DashboardFinanceiroParams {
  competencia: string;
}

export async function getDashboardFinanceiro(
  params: DashboardFinanceiroParams,
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/financeiros/dashboard${buildQuery(params)}`,
    ),
  );
}

/* ====================== Indicadores Operacionais ===================== */

export interface NoShowParams extends CompetenciaRangeParams {
  recursoUuid?: string;
}

export async function getIndicadorNoShow(
  params: NoShowParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/operacionais/no-show${buildQuery(params)}`,
    ),
  );
}

export interface DataRangeParams {
  dataInicio?: string;
  dataFim?: string;
}

export async function getIndicadorClassificacaoRisco(
  params: DataRangeParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/operacionais/classificacao-risco${buildQuery(params)}`,
    ),
  );
}

export interface CirurgiasSalaParams extends DataRangeParams {
  salaUuid?: string;
}

export async function getIndicadorCirurgiasSala(
  params: CirurgiasSalaParams = {},
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/operacionais/cirurgias-sala${buildQuery(params)}`,
    ),
  );
}

export interface DashboardOperacionalIndicadoresParams extends DataRangeParams {}

export async function getDashboardOperacionalResumo(
  params: DashboardOperacionalIndicadoresParams,
): Promise<Record<string, unknown>> {
  return unwrap(
    await apiGet<Record<string, unknown>>(
      `/indicadores/operacionais/dashboard${buildQuery(params)}`,
    ),
  );
}

/* ============================== Export ============================== */

const RAW_API_URL = import.meta.env.VITE_API_URL ?? '';
const API_URL = RAW_API_URL.replace(/\/$/, '');

/**
 * `exportar` — POST /v1/bi/export?formato=csv|xlsx&view=mv_xxx
 *
 * O endpoint retorna o arquivo binário (CSV/XLSX). Usamos `fetch` direto
 * para conseguir consumir como `Blob` (o `apiPost` parseia JSON).
 * Injetamos manualmente o Bearer token a partir do `auth-store`.
 */
export async function exportar(
  view: BiView,
  formato: ExportFormato,
  body: ExportInput,
): Promise<Blob> {
  const { accessToken } = getAuthSnapshot();
  const url = `${API_URL}/v1${`/bi/export${buildQuery({ formato, view })}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: '*/*',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'erro de rede';
    throw new ApiError({
      message: `Falha de rede ao exportar BI: ${reason}`,
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      detail = await response.text();
    } catch {
      detail = undefined;
    }
    throw new ApiError({
      message: `Falha ao exportar BI (${response.status})`,
      status: response.status,
      code: 'BI_EXPORT_FAILED',
      detail,
    });
  }

  return response.blob();
}

/**
 * Helper de download — gera URL temporária a partir do Blob, dispara o
 * clique programaticamente e libera o object URL. Usado nos botões de
 * "Exportar CSV/XLSX" das páginas de indicadores.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Sugere um nome de arquivo padrão baseado na view + formato + timestamp.
 * Ex.: `mv_glosa_status-2026-05-04T13-22-00.csv`.
 */
export function defaultExportFilename(
  view: BiView,
  formato: ExportFormato,
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${view}-${stamp}.${formato}`;
}
