/**
 * Validador de conselho profissional (CRM, COREN, CRF, ...).
 *
 * Trilha B / Fase 3:
 *   - Tipo de conselho: enum `enum_prestador_tipo_conselho`.
 *   - UF: 2 letras maiúsculas (lista oficial das 27 UFs brasileiras).
 *   - Número: string livre (alguns conselhos usam dígitos com padding,
 *     outros usam dígito-verificador, outros incluem letra). Não há
 *     validação de algoritmo padronizada nacional, então aplicamos
 *     apenas regra mínima: 1..20 caracteres alfanuméricos com hífen.
 *
 * NÃO valida `RQE` aqui (registro de qualificação de especialista) —
 * esse vínculo é da tabela `prestadores_especialidades`.
 */

export type TipoConselho =
  | 'CRM'
  | 'COREN'
  | 'CRF'
  | 'CRN'
  | 'CREFITO'
  | 'CRP'
  | 'CRO'
  | 'CRBM'
  | 'CRFa'
  | 'OUTROS';

export const TIPOS_CONSELHO: ReadonlyArray<TipoConselho> = [
  'CRM',
  'COREN',
  'CRF',
  'CRN',
  'CREFITO',
  'CRP',
  'CRO',
  'CRBM',
  'CRFa',
  'OUTROS',
];

export const UFS_BRASIL: ReadonlyArray<string> = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

export interface ConselhoValidationError {
  field: 'tipoConselho' | 'numeroConselho' | 'ufConselho';
  message: string;
}

export interface ConselhoInput {
  tipoConselho: string;
  numeroConselho: string;
  ufConselho: string;
}

/**
 * Valida conselho. Retorna lista de erros (vazia = ok).
 */
export function validateConselho(
  input: ConselhoInput,
): ConselhoValidationError[] {
  const errors: ConselhoValidationError[] = [];

  if (!TIPOS_CONSELHO.includes(input.tipoConselho as TipoConselho)) {
    errors.push({
      field: 'tipoConselho',
      message: `tipoConselho inválido. Esperado um de: ${TIPOS_CONSELHO.join(', ')}`,
    });
  }

  const uf = (input.ufConselho ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf) || !UFS_BRASIL.includes(uf)) {
    errors.push({
      field: 'ufConselho',
      message: 'ufConselho deve ser uma UF brasileira (2 letras).',
    });
  }

  const numero = input.numeroConselho ?? '';
  if (numero.length === 0 || numero.length > 20) {
    errors.push({
      field: 'numeroConselho',
      message: 'numeroConselho deve ter de 1 a 20 caracteres.',
    });
  } else if (!/^[A-Za-z0-9-]+$/.test(numero)) {
    errors.push({
      field: 'numeroConselho',
      message: 'numeroConselho aceita apenas letras, dígitos e hífen.',
    });
  }

  return errors;
}

/**
 * Verifica algoritmo de CPF (mod 11 com 2 dígitos verificadores).
 * Aceita formato `XXX.XXX.XXX-XX` ou apenas dígitos.
 *
 * Retorna `true` se válido, `false` caso contrário. Não retira CPFs
 * de "lista negra" óbvia (todos dígitos iguais → inválido).
 */
export function isValidCpf(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 11) {
    return false;
  }
  // Rejeita CPFs com todos os dígitos iguais (000... 111... 999...).
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const calcDigit = (slice: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += parseInt(slice[i], 10) * (factorStart - i);
    }
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };

  const d1 = calcDigit(digits.slice(0, 9), 10);
  if (d1 !== parseInt(digits[9], 10)) {
    return false;
  }
  const d2 = calcDigit(digits.slice(0, 10), 11);
  return d2 === parseInt(digits[10], 10);
}

/**
 * Verifica algoritmo de CNPJ (mod 11 com pesos específicos, 2 DVs).
 * Aceita formato `XX.XXX.XXX/XXXX-XX` ou apenas dígitos.
 */
export function isValidCnpj(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 14) {
    return false;
  }
  if (/^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (slice: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += parseInt(slice[i], 10) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const d1 = calcDigit(digits.slice(0, 12), weights1);
  if (d1 !== parseInt(digits[12], 10)) {
    return false;
  }
  const d2 = calcDigit(digits.slice(0, 13), weights2);
  return d2 === parseInt(digits[13], 10);
}
