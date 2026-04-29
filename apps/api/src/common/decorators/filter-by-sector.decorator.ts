/**
 * `@FilterBySector(recurso, acaoBase)` — ABAC para handlers que listam
 * recursos clínicos.
 *
 * Em runtime, `SectorFilterInterceptor` lê esta metadata e popula
 * `request.sectorFilter` com:
 *   - `null`  → o usuário tem o override `<recurso>:<acaoBase>:all` e
 *               pode ver tudo no tenant. NENHUM filtro é injetado.
 *   - `bigint[]` → lista de setores do usuário. O repositório DEVE
 *               injetar `WHERE setor_id IN (...)` (ou usar o helper
 *               `applySectorFilter()` em fases futuras).
 *
 * **Fase 2 (este entregável)**: a tabela `usuario_setores` ainda não
 * existe (modelo entra na Fase 3 — Cadastros). Por enquanto:
 *   - Se o usuário tem `<recurso>:<acaoBase>:all`: filtro é `null`.
 *   - Senão: filtro é `[]` (lista vazia ⇒ deny-by-default).
 * Esse comportamento é seguro (não vaza dados) e força a Fase 3 a
 * popular `usuario_setores` antes de habilitar o decorator em produção.
 */
import { SetMetadata } from '@nestjs/common';

export const SECTOR_FILTER_KEY = 'sectorFilter';

export interface SectorFilterMetadata {
  recurso: string;
  acaoBase: string;
}

export const FilterBySector = (
  recurso: string,
  acaoBase: string,
): MethodDecorator =>
  SetMetadata<string, SectorFilterMetadata>(SECTOR_FILTER_KEY, {
    recurso,
    acaoBase,
  });

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * `null`  → sem filtro (override `:all`).
       * `bigint[]` → restringir a estes setores.
       * `undefined` → handler não usa @FilterBySector.
       */
      sectorFilter?: bigint[] | null;
    }
  }
}
