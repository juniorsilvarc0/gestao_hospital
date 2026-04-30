/**
 * Validador de CPF (algoritmo dos dois dígitos verificadores).
 *
 * - `normalize(raw)`: remove caracteres não-numéricos. Retorna `undefined`
 *   se o resultado não tiver exatamente 11 dígitos.
 * - `isValid(raw)`: aplica o algoritmo. Rejeita CPFs com todos os dígitos
 *   iguais (ex.: 111.111.111-11), que falham a validação por design e
 *   são notório vetor de cadastros falsos.
 *
 * Documentação do algoritmo:
 *   https://www.macoratti.net/alg_cpf.htm
 *   (Validação oficial pela RFB segue esse exato algoritmo.)
 */

const CPF_LENGTH = 11;

export const CpfValidator = {
  /**
   * Remove tudo que não for dígito. Retorna `undefined` se não restarem
   * exatamente 11 caracteres — útil para falhar cedo no DTO.
   */
  normalize(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== CPF_LENGTH) {
      return undefined;
    }
    return digits;
  },

  /**
   * `true` se o CPF passar nos dois dígitos verificadores E não for
   * sequência repetida (000.000.000-00, 111.111.111-11, ...).
   */
  isValid(raw: string): boolean {
    const cpf = this.normalize(raw);
    if (cpf === undefined) {
      return false;
    }
    if (/^(\d)\1{10}$/.test(cpf)) {
      return false;
    }

    const calcDigit = (slice: string, factorStart: number): number => {
      let sum = 0;
      for (let i = 0; i < slice.length; i += 1) {
        sum += Number(slice[i]) * (factorStart - i);
      }
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };

    const dv1 = calcDigit(cpf.slice(0, 9), 10);
    if (dv1 !== Number(cpf[9])) {
      return false;
    }
    const dv2 = calcDigit(cpf.slice(0, 10), 11);
    if (dv2 !== Number(cpf[10])) {
      return false;
    }
    return true;
  },
};
