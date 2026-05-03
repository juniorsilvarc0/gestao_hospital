/**
 * Hash de CPF para visitante (LGPD).
 *
 * - Hash SHA-256 com "salt" composto pelo `tenant_id` — impede que o
 *   mesmo CPF tenha o mesmo hash entre tenants diferentes (defesa em
 *   profundidade contra cross-tenant lookups).
 * - Mantém apenas os 4 últimos dígitos do CPF para exibição parcial
 *   ("***.***.***-12"), seguindo a recomendação da ANPD para
 *   identificadores irreversivelmente sensíveis.
 *
 * NÃO armazenamos o CPF em claro nem cifrado. Visitantes não têm
 * histórico clínico — o CPF serve só para deduplicar entradas do mesmo
 * visitante e bloquear retornos indesejados.
 */
import { createHash } from 'node:crypto';

export interface CpfHashed {
  cpfHash: string;
  cpfUltimos4: string;
}

const ONLY_DIGITS = /\D+/g;

/**
 * Normaliza CPF para 11 dígitos (sem máscara). Aceita "123.456.789-01"
 * ou "12345678901". Retorna `null` se não bater 11 dígitos.
 */
export function normalizeCpf(cpf: string): string | null {
  const digits = cpf.replace(ONLY_DIGITS, '');
  if (digits.length !== 11) return null;
  return digits;
}

/**
 * Gera o par (hash, últimos 4) do CPF. `tenantId` é misturado ao hash.
 * Lança `Error` se o CPF não for válido (11 dígitos).
 */
export function hashCpf(cpfRaw: string, tenantId: bigint): CpfHashed {
  const digits = normalizeCpf(cpfRaw);
  if (digits === null) {
    throw new Error('CPF inválido — esperado 11 dígitos.');
  }
  const cpfHash = createHash('sha256')
    .update(`${tenantId.toString()}:${digits}`)
    .digest('hex');
  return {
    cpfHash,
    cpfUltimos4: digits.slice(-4),
  };
}
