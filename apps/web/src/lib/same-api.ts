/**
 * Wrappers tipados para os endpoints do SAME (Fase 10 — Trilha R-B).
 *
 * Endpoints:
 *   GET    /v1/same/prontuarios?status=&page=
 *   GET    /v1/same/prontuarios/:uuid
 *   POST   /v1/same/prontuarios
 *   PATCH  /v1/same/prontuarios/:uuid
 *   POST   /v1/same/prontuarios/:uuid/digitalizar
 *   GET    /v1/same/emprestimos?status=&page=
 *   GET    /v1/same/emprestimos/:uuid
 *   POST   /v1/same/emprestimos
 *   POST   /v1/same/emprestimos/:uuid/devolver
 *   GET    /v1/same/emprestimos/atrasados
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CreateEmprestimoInput,
  CreateProntuarioInput,
  DevolverEmprestimoInput,
  DigitalizarProntuarioInput,
  ListEmprestimosParams,
  ListProntuariosParams,
  PaginatedEmprestimos,
  PaginatedProntuarios,
  SameEmprestimo,
  SameProntuario,
  UpdateProntuarioInput,
} from '@/types/same';

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

/* ============================== Prontuários ============================== */

export async function listProntuarios(
  params: ListProntuariosParams = {},
): Promise<PaginatedProntuarios> {
  return apiGet<PaginatedProntuarios>(
    `/same/prontuarios${buildQuery(params)}`,
  );
}

export async function getProntuario(uuid: string): Promise<SameProntuario> {
  const response = await apiGet<SameProntuario | Envelope<SameProntuario>>(
    `/same/prontuarios/${uuid}`,
  );
  return unwrap(response);
}

export async function createProntuario(
  input: CreateProntuarioInput,
): Promise<SameProntuario> {
  const response = await apiPost<SameProntuario | Envelope<SameProntuario>>(
    `/same/prontuarios`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateProntuario(
  uuid: string,
  input: UpdateProntuarioInput,
): Promise<SameProntuario> {
  const response = await apiPatch<SameProntuario | Envelope<SameProntuario>>(
    `/same/prontuarios/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function digitalizarProntuario(
  uuid: string,
  input: DigitalizarProntuarioInput,
): Promise<SameProntuario> {
  const response = await apiPost<SameProntuario | Envelope<SameProntuario>>(
    `/same/prontuarios/${uuid}/digitalizar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

/* ============================== Empréstimos ============================== */

export async function listEmprestimos(
  params: ListEmprestimosParams = {},
): Promise<PaginatedEmprestimos> {
  return apiGet<PaginatedEmprestimos>(
    `/same/emprestimos${buildQuery(params)}`,
  );
}

export async function getEmprestimo(uuid: string): Promise<SameEmprestimo> {
  const response = await apiGet<SameEmprestimo | Envelope<SameEmprestimo>>(
    `/same/emprestimos/${uuid}`,
  );
  return unwrap(response);
}

export async function createEmprestimo(
  input: CreateEmprestimoInput,
): Promise<SameEmprestimo> {
  const response = await apiPost<SameEmprestimo | Envelope<SameEmprestimo>>(
    `/same/emprestimos`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function devolverEmprestimo(
  uuid: string,
  input: DevolverEmprestimoInput = {},
): Promise<SameEmprestimo> {
  const response = await apiPost<SameEmprestimo | Envelope<SameEmprestimo>>(
    `/same/emprestimos/${uuid}/devolver`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function listAtrasados(
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedEmprestimos> {
  return apiGet<PaginatedEmprestimos>(
    `/same/emprestimos/atrasados${buildQuery(params)}`,
  );
}
