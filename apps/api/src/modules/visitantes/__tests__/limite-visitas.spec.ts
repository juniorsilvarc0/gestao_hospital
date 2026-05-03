/**
 * Limite de visitas simultâneas por tipo de acomodação (RN-VIS-02).
 */
import { describe, expect, it } from 'vitest';

import {
  atingiuLimite,
  exigeAutorizacaoUti,
  limiteSimultaneos,
} from '../domain/limite-visitas';

describe('limiteSimultaneos', () => {
  it('ENFERMARIA = 2', () => {
    expect(limiteSimultaneos('ENFERMARIA')).toBe(2);
  });

  it('APARTAMENTO = 4', () => {
    expect(limiteSimultaneos('APARTAMENTO')).toBe(4);
  });

  it('UTI = 1', () => {
    expect(limiteSimultaneos('UTI')).toBe(1);
  });

  it('null/undefined cai em default 2', () => {
    expect(limiteSimultaneos(null)).toBe(2);
    expect(limiteSimultaneos(undefined)).toBe(2);
  });

  it('tipo desconhecido cai em default 2', () => {
    expect(limiteSimultaneos('OUTRO_TIPO')).toBe(2);
  });
});

describe('atingiuLimite', () => {
  it('ENFERMARIA com 2 visitas: atingido', () => {
    expect(atingiuLimite('ENFERMARIA', 2)).toBe(true);
  });

  it('ENFERMARIA com 1 visita: ainda livre', () => {
    expect(atingiuLimite('ENFERMARIA', 1)).toBe(false);
  });

  it('APARTAMENTO com 4 visitas: atingido', () => {
    expect(atingiuLimite('APARTAMENTO', 4)).toBe(true);
  });

  it('APARTAMENTO com 3 visitas: livre', () => {
    expect(atingiuLimite('APARTAMENTO', 3)).toBe(false);
  });
});

describe('exigeAutorizacaoUti', () => {
  it('UTI exige autorização', () => {
    expect(exigeAutorizacaoUti('UTI')).toBe(true);
  });

  it('outros setores não', () => {
    expect(exigeAutorizacaoUti('INTERNACAO')).toBe(false);
    expect(exigeAutorizacaoUti('PRONTO_SOCORRO')).toBe(false);
    expect(exigeAutorizacaoUti(null)).toBe(false);
  });
});
