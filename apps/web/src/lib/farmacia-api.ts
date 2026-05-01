/**
 * Wrappers tipados para os endpoints de Farmácia (Fase 7 — Trilha A).
 *
 * Endpoints (docs/05-apis-rest.md §Farmácia):
 *   GET   /v1/farmacia/painel?turno=&data=
 *   POST  /v1/dispensacoes
 *   POST  /v1/dispensacoes/:uuid/separar
 *   POST  /v1/dispensacoes/:uuid/dispensar
 *   POST  /v1/dispensacoes/:uuid/devolver
 *   GET   /v1/farmacia/livro-controlados?procedimentoUuid=&dataInicio=&dataFim=&lote=
 *   POST  /v1/farmacia/livro-controlados/movimento
 *
 * WebSocket: namespace `/farmacia` rooms `tenant:<id>:turno:<TURNO>`.
 */
import { apiGet, apiPost } from '@/lib/api-client';
import type {
  CreateDispensacaoInput,
  CreateMovimentoControladoInput,
  DevolverDispensacaoInput,
  Dispensacao,
  ListPainelParams,
  LivroControladosListParams,
  MovimentoControladoResult,
  PainelFarmacia,
  PaginatedLivroControlados,
  SepararDispensacaoInput,
} from '@/types/farmacia';

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

export async function getPainel(
  params: ListPainelParams = {},
): Promise<PainelFarmacia> {
  const response = await apiGet<PainelFarmacia | Envelope<PainelFarmacia>>(
    `/farmacia/painel${buildQuery(params)}`,
  );
  return unwrap(response);
}

export async function createDispensacao(
  input: CreateDispensacaoInput,
): Promise<Dispensacao> {
  const response = await apiPost<Dispensacao | Envelope<Dispensacao>>(
    `/dispensacoes`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function separarDispensacao(
  uuid: string,
  input: SepararDispensacaoInput,
): Promise<Dispensacao> {
  const response = await apiPost<Dispensacao | Envelope<Dispensacao>>(
    `/dispensacoes/${uuid}/separar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function dispensarDispensacao(
  uuid: string,
): Promise<Dispensacao> {
  const response = await apiPost<Dispensacao | Envelope<Dispensacao>>(
    `/dispensacoes/${uuid}/dispensar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function devolverDispensacao(
  uuid: string,
  input: DevolverDispensacaoInput,
): Promise<Dispensacao> {
  const response = await apiPost<Dispensacao | Envelope<Dispensacao>>(
    `/dispensacoes/${uuid}/devolver`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function getLivroControlados(
  params: LivroControladosListParams = {},
): Promise<PaginatedLivroControlados> {
  return apiGet<PaginatedLivroControlados>(
    `/farmacia/livro-controlados${buildQuery(params)}`,
  );
}

export async function lancarMovimentoControlado(
  input: CreateMovimentoControladoInput,
): Promise<MovimentoControladoResult> {
  const response = await apiPost<
    MovimentoControladoResult | Envelope<MovimentoControladoResult>
  >(`/farmacia/livro-controlados/movimento`, input, { idempotent: true });
  return unwrap(response);
}
