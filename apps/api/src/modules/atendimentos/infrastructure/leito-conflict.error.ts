/**
 * `LeitoConflictError` — sinaliza falha em alocação de leito por
 * race condition / versão stale / leito não disponível. Mapeada para
 * HTTP 409 Conflict pelo `ExceptionFilter` do controller.
 *
 * Por que classe própria (em vez de `ConflictException` direto)?
 * - Concentra metadados (`versaoAtual`, `motivo`) para a UI mostrar
 *   ao usuário e refazer o GET do mapa.
 * - Use cases podem fazer `instanceof` para diferenciar de outros
 *   conflicts (ex.: dupla alta).
 */
export type LeitoConflictMotivo =
  | 'STALE_VERSION'
  | 'NOT_DISPONIVEL'
  | 'NOT_FOUND'
  | 'RACE'
  | 'OTHER';

export class LeitoConflictError extends Error {
  readonly versaoAtual: number | null;
  readonly motivo: LeitoConflictMotivo;

  constructor(
    motivo: LeitoConflictMotivo,
    versaoAtual: number | null,
    message?: string,
  ) {
    super(message ?? `Leito conflict: ${motivo}`);
    this.name = 'LeitoConflictError';
    this.versaoAtual = versaoAtual;
    this.motivo = motivo;
  }
}
