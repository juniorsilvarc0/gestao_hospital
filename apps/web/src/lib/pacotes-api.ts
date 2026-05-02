/**
 * Wrappers tipados para CRUD de Pacotes (Fase 8 — Trilha A).
 *
 * Endpoints:
 *   GET    /v1/pacotes
 *   GET    /v1/pacotes/:uuid
 *   POST   /v1/pacotes
 *   PATCH  /v1/pacotes/:uuid
 *   DELETE /v1/pacotes/:uuid
 */
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CreatePacoteInput,
  Pacote,
  PaginatedPacotes,
  UpdatePacoteInput,
} from '@/types/contas';

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
    usp.set(key, String(value));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

export async function listPacotes(
  params: { convenioUuid?: string; ativo?: boolean; page?: number; pageSize?: number } = {},
): Promise<PaginatedPacotes> {
  return apiGet<PaginatedPacotes>(`/pacotes${buildQuery(params)}`);
}

export async function getPacote(uuid: string): Promise<Pacote> {
  const response = await apiGet<Pacote | Envelope<Pacote>>(`/pacotes/${uuid}`);
  return unwrap(response);
}

export async function createPacote(input: CreatePacoteInput): Promise<Pacote> {
  const response = await apiPost<Pacote | Envelope<Pacote>>(
    `/pacotes`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updatePacote(
  uuid: string,
  input: UpdatePacoteInput,
): Promise<Pacote> {
  const response = await apiPatch<Pacote | Envelope<Pacote>>(
    `/pacotes/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function deletePacote(uuid: string): Promise<void> {
  await apiDelete<void>(`/pacotes/${uuid}`);
}
