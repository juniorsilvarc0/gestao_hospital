/**
 * Wrappers tipados para os endpoints de Centro Cirúrgico (Fase 7 — Trilha B).
 *
 * Endpoints (docs/05-apis-rest.md §Centro Cirúrgico):
 *   GET   /v1/centro-cirurgico/mapa?data=
 *   GET   /v1/cirurgias?data=&salaUuid=&cirurgiaoUuid=&status=
 *   GET   /v1/cirurgias/:uuid
 *   POST  /v1/cirurgias
 *   PATCH /v1/cirurgias/:uuid
 *   POST  /v1/cirurgias/:uuid/confirmar
 *   POST  /v1/cirurgias/:uuid/iniciar
 *   POST  /v1/cirurgias/:uuid/encerrar
 *   POST  /v1/cirurgias/:uuid/cancelar
 *   POST  /v1/cirurgias/:uuid/ficha-cirurgica
 *   POST  /v1/cirurgias/:uuid/ficha-anestesica
 *   POST  /v1/cirurgias/:uuid/opme/solicitar
 *   POST  /v1/cirurgias/:uuid/opme/autorizar
 *   POST  /v1/cirurgias/:uuid/opme/utilizar
 *
 * WebSocket: namespace `/centro-cirurgico` room `tenant:<id>:mapa-salas`.
 */
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';
import type {
  CancelarCirurgiaInput,
  Cirurgia,
  CreateCirurgiaInput,
  FichaAnestesicaConteudo,
  FichaCirurgicaConteudo,
  ListCirurgiasParams,
  MapaSalas,
  OpmeAutorizarInput,
  OpmeSolicitarInput,
  OpmeUtilizarInput,
  PaginatedCirurgias,
  UpdateCirurgiaInput,
} from '@/types/centro-cirurgico';

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

export async function getMapaSalas(data?: string): Promise<MapaSalas> {
  const response = await apiGet<MapaSalas | Envelope<MapaSalas>>(
    `/centro-cirurgico/mapa${buildQuery({ data })}`,
  );
  return unwrap(response);
}

export async function listCirurgias(
  params: ListCirurgiasParams = {},
): Promise<PaginatedCirurgias> {
  return apiGet<PaginatedCirurgias>(`/cirurgias${buildQuery(params)}`);
}

export async function getCirurgia(uuid: string): Promise<Cirurgia> {
  const response = await apiGet<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}`,
  );
  return unwrap(response);
}

export async function createCirurgia(
  input: CreateCirurgiaInput,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function updateCirurgia(
  uuid: string,
  input: UpdateCirurgiaInput,
): Promise<Cirurgia> {
  const response = await apiPatch<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}`,
    input,
  );
  return unwrap(response);
}

export async function confirmarCirurgia(uuid: string): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/confirmar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function iniciarCirurgia(uuid: string): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/iniciar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function encerrarCirurgia(uuid: string): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/encerrar`,
    {},
    { idempotent: true },
  );
  return unwrap(response);
}

export async function cancelarCirurgia(
  uuid: string,
  input: CancelarCirurgiaInput,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/cancelar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function salvarFichaCirurgica(
  uuid: string,
  conteudo: FichaCirurgicaConteudo,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/ficha-cirurgica`,
    conteudo,
  );
  return unwrap(response);
}

export async function salvarFichaAnestesica(
  uuid: string,
  conteudo: FichaAnestesicaConteudo,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/ficha-anestesica`,
    conteudo,
  );
  return unwrap(response);
}

export async function solicitarOpme(
  uuid: string,
  input: OpmeSolicitarInput,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/opme/solicitar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function autorizarOpme(
  uuid: string,
  input: OpmeAutorizarInput,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/opme/autorizar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}

export async function utilizarOpme(
  uuid: string,
  input: OpmeUtilizarInput,
): Promise<Cirurgia> {
  const response = await apiPost<Cirurgia | Envelope<Cirurgia>>(
    `/cirurgias/${uuid}/opme/utilizar`,
    input,
    { idempotent: true },
  );
  return unwrap(response);
}
