/**
 * Validadores client-side de CPF e CNS.
 *
 * - CPF: algoritmo dos dois dígitos verificadores (espelha a versão
 *   do backend em `apps/api/src/modules/pacientes/infrastructure/cpf.validator.ts`).
 * - CNS: 15 dígitos. Validação por mod 11 conforme DataSUS
 *   (https://www.gov.br/saude/pt-br/composicao/datasus).
 *   Suporta tanto CNS iniciados com 1/2 quanto 7/8/9.
 *
 * Em ambos: rejeitam sequências repetidas (ex.: 11111111111).
 */

const CPF_LENGTH = 11;

export const Cpf = {
  digits(raw: string): string {
    return raw.replace(/\D/g, '');
  },
  isValid(raw: string): boolean {
    const cpf = this.digits(raw);
    if (cpf.length !== CPF_LENGTH) return false;
    if (/^(\d)\1{10}$/u.test(cpf)) return false;
    const calc = (slice: string, factorStart: number): number => {
      let sum = 0;
      for (let i = 0; i < slice.length; i += 1) {
        sum += Number(slice[i]) * (factorStart - i);
      }
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    const dv1 = calc(cpf.slice(0, 9), 10);
    if (dv1 !== Number(cpf[9])) return false;
    const dv2 = calc(cpf.slice(0, 10), 11);
    return dv2 === Number(cpf[10]);
  },
  format(raw: string): string {
    const d = this.digits(raw);
    if (d.length !== CPF_LENGTH) return raw;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  },
};

const CNS_LENGTH = 15;

export const Cns = {
  digits(raw: string): string {
    return raw.replace(/\D/g, '');
  },
  isValid(raw: string): boolean {
    const cns = this.digits(raw);
    if (cns.length !== CNS_LENGTH) return false;
    if (/^(\d)\1{14}$/u.test(cns)) return false;
    const first = cns[0];

    if (first === '1' || first === '2') {
      // CNS definitivo. Validação pelo módulo 11.
      const pis = cns.slice(0, 11);
      let soma = 0;
      for (let i = 0; i < 11; i += 1) {
        soma += Number(pis[i]) * (15 - i);
      }
      let resto = soma % 11;
      let dv = 11 - resto;
      let resultado: string;
      if (dv === 11) dv = 0;
      if (dv === 10) {
        soma += 2;
        resto = soma % 11;
        dv = 11 - resto;
        resultado = `${pis}001${dv}`;
      } else {
        resultado = `${pis}000${dv}`;
      }
      return resultado === cns;
    }

    if (first === '7' || first === '8' || first === '9') {
      // CNS provisório (cartão usuário sem CPF). Validação direta pelo módulo 11.
      let soma = 0;
      for (let i = 0; i < 15; i += 1) {
        soma += Number(cns[i]) * (15 - i);
      }
      return soma % 11 === 0;
    }
    return false;
  },
  format(raw: string): string {
    const d = this.digits(raw);
    if (d.length !== CNS_LENGTH) return raw;
    return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
  },
};
