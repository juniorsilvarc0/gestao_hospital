/**
 * Wrapper tipado para validação ICP-Brasil (Fase 13 — R-B).
 *
 *   POST /v1/security/icp-brasil/validar
 *   body { certData } → { valid, reason, subject?, issuer?, validoAte? }
 */
import { apiPost } from '@/lib/api-client';
import type {
  IcpBrasilValidacaoInput,
  IcpBrasilValidacaoResult,
} from '@/types/admin';

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

export async function validateCertificate(
  input: IcpBrasilValidacaoInput,
): Promise<IcpBrasilValidacaoResult> {
  const response = await apiPost<
    IcpBrasilValidacaoResult | Envelope<IcpBrasilValidacaoResult>
  >(`/security/icp-brasil/validar`, input, { idempotent: true });
  return unwrap(response);
}
