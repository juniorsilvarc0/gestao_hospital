/**
 * Detector / wrapper para violação da EXCLUDE constraint
 * `xc_agend_overlap` (RN-AGE-01).
 *
 * Postgres devolve SQLSTATE `23P01` (exclusion_violation) — Prisma
 * envelopa em `Prisma.PrismaClientKnownRequestError` com `code = 'P2010'`
 * para erros de raw query e `meta.code = '23P01'`. Em alguns casos
 * o Prisma re-empacota como `PrismaClientUnknownRequestError`, então
 * fazemos detecção tolerante a ambos os caminhos via `.message`.
 */
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const OVERBOOKING_CODE = 'OVERBOOKING';

export class OverbookingError extends ConflictException {
  constructor(detail = 'Recurso já tem agendamento conflitante no horário') {
    super({
      code: OVERBOOKING_CODE,
      message: detail,
      detail,
    });
  }
}

/**
 * Heurística de detecção:
 *   - SQLSTATE 23P01 (`exclusion_violation`)
 *   - mensagem contendo `xc_agend_overlap` (nome da constraint)
 *
 * Mantém o erro original para qualquer outro tipo (rethrown intacto).
 */
export function isOverbookingError(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const meta = (err as { meta?: { code?: string } }).meta;
    if (meta?.code === '23P01') {
      return true;
    }
  }
  if (err instanceof Error) {
    const msg = err.message;
    return (
      msg.includes('xc_agend_overlap') ||
      msg.includes('exclusion_violation') ||
      msg.includes('conflicting key value violates exclusion constraint')
    );
  }
  return false;
}

/**
 * Helper: se o erro for overbooking, lança `OverbookingError`. Caso
 * contrário, propaga.
 */
export function rethrowOverbooking(err: unknown): never {
  if (isOverbookingError(err)) {
    throw new OverbookingError();
  }
  throw err;
}
