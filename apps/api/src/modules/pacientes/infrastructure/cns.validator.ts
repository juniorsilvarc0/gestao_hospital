/**
 * Validador de CNS (Cartão Nacional de Saúde — DataSUS).
 *
 * O CNS tem 15 dígitos. Há duas faixas:
 *   - Definitivo: começa com 1 ou 2 → soma ponderada de 15..1, mod 11
 *     (incluindo o DV embutido nos últimos quatro dígitos).
 *   - Provisório (cartão temporário ou estrangeiros): começa com 7, 8 ou 9
 *     → mesma soma ponderada, sem o tratamento de zerar e re-somar.
 *
 * Em ambos os casos, a soma deve ser múltipla de 11.
 *
 * Referência: Portaria SAS/MS Nº 17/2007 e o algoritmo público
 * documentado em https://integracao.esusab.ufsc.br/v500/docs/algoritmo_CNS.html
 */

const CNS_LENGTH = 15;

export const CnsValidator = {
  normalize(raw: string): string | undefined {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== CNS_LENGTH) {
      return undefined;
    }
    return digits;
  },

  isValid(raw: string): boolean {
    const cns = this.normalize(raw);
    if (cns === undefined) {
      return false;
    }

    const first = cns[0];
    if (first === '1' || first === '2') {
      return this.isValidDefinitive(cns);
    }
    if (first === '7' || first === '8' || first === '9') {
      return this.isValidProvisional(cns);
    }
    return false;
  },

  /**
   * Para CNS começando em 1/2: o DV (4 dígitos) é construído a partir
   * dos 11 primeiros dígitos. A soma final dos 15 dígitos com pesos
   * 15..1 deve ser múltipla de 11.
   */
  isValidDefinitive(cns: string): boolean {
    let sum = 0;
    for (let i = 0; i < CNS_LENGTH; i += 1) {
      sum += Number(cns[i]) * (CNS_LENGTH - i);
    }
    return sum % 11 === 0;
  },

  /**
   * Para CNS começando em 7/8/9: cartão "provisório", mesmo tratamento
   * de soma ponderada (15..1) — múltiplo de 11 valida.
   */
  isValidProvisional(cns: string): boolean {
    let sum = 0;
    for (let i = 0; i < CNS_LENGTH; i += 1) {
      sum += Number(cns[i]) * (CNS_LENGTH - i);
    }
    return sum % 11 === 0;
  },
};
