/**
 * Helper SHA-256 — usamos o `crypto` nativo do Node.
 *
 * O hash é armazenado em `guias_tiss.hash_xml` e `lotes_tiss.hash_xml`
 * como prova de integridade (CLAUDE.md §7 #5). Útil para provar que o
 * XML enviado é exatamente aquele que a operadora recebeu, em caso de
 * disputa.
 */
import { createHash } from 'node:crypto';

/** Devolve o SHA-256 em hex minúsculo (64 chars). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
