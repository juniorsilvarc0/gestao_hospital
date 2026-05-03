/**
 * Domínio — antibiograma (campo `resistencia` JSONB em `ccih_casos`).
 *
 * Schema:
 *   [{ antibiotico: string, resultado: 'RESISTENTE'|'SENSIVEL'|'INTERMEDIARIO' }]
 *
 * Helpers puros para validação. Não dependem de framework para que os
 * testes unitários rodem sem Nest.
 */

export const RESISTENCIA_RESULTADOS = [
  'RESISTENTE',
  'SENSIVEL',
  'INTERMEDIARIO',
] as const;
export type ResistenciaResultado = (typeof RESISTENCIA_RESULTADOS)[number];

export interface AntibiogramaEntry {
  antibiotico: string;
  resultado: ResistenciaResultado;
}

/**
 * Valida o payload do antibiograma. Retorna `null` se OK ou string com
 * mensagem de erro descritiva (campo + linha).
 */
export function validateAntibiograma(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) {
    return 'resistencia deve ser um array';
  }
  for (let i = 0; i < input.length; i++) {
    const entry = input[i] as Partial<AntibiogramaEntry> | null;
    if (entry === null || typeof entry !== 'object') {
      return `resistencia[${i}] inválida — esperado objeto`;
    }
    if (typeof entry.antibiotico !== 'string' || entry.antibiotico.trim() === '') {
      return `resistencia[${i}].antibiotico deve ser string não-vazia`;
    }
    if (entry.antibiotico.length > 80) {
      return `resistencia[${i}].antibiotico excede 80 caracteres`;
    }
    if (
      entry.resultado === undefined ||
      !(RESISTENCIA_RESULTADOS as readonly string[]).includes(entry.resultado)
    ) {
      return `resistencia[${i}].resultado deve ser um de: ${RESISTENCIA_RESULTADOS.join(', ')}`;
    }
  }
  return null;
}

/**
 * Normaliza para uppercase do antibiótico — acomoda variantes de
 * digitação ("amoxicilina", "Amoxicilina", "AMOXICILINA").
 */
export function normalizeAntibiograma(
  input: AntibiogramaEntry[] | null | undefined,
): AntibiogramaEntry[] | null {
  if (input === null || input === undefined) return null;
  return input.map((e) => ({
    antibiotico: e.antibiotico.trim().toUpperCase(),
    resultado: e.resultado,
  }));
}
