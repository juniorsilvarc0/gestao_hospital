/**
 * Testes da matriz de transições de etapas de artigo CME.
 */
import { describe, expect, it } from 'vitest';

import {
  destinosValidos,
  isTransicaoValida,
  validateEmUsoArgs,
} from '../domain/etapa-transicoes';

describe('isTransicaoValida — matriz feliz', () => {
  it('fluxo principal: RECEPCAO → LIMPEZA → PREPARO → ESTERILIZACAO → GUARDA → DISTRIBUICAO → EM_USO → RECEPCAO', () => {
    const sequencia = [
      ['RECEPCAO', 'LIMPEZA'],
      ['LIMPEZA', 'PREPARO'],
      ['PREPARO', 'ESTERILIZACAO'],
      ['ESTERILIZACAO', 'GUARDA'],
      ['GUARDA', 'DISTRIBUICAO'],
      ['DISTRIBUICAO', 'EM_USO'],
      ['EM_USO', 'RECEPCAO'],
    ] as const;
    for (const [from, to] of sequencia) {
      expect(isTransicaoValida(from, to)).toBe(true);
    }
  });

  it('qualquer não-terminal aceita DESCARTADO', () => {
    const etapas = [
      'RECEPCAO',
      'LIMPEZA',
      'PREPARO',
      'ESTERILIZACAO',
      'GUARDA',
      'DISTRIBUICAO',
      'EM_USO',
    ] as const;
    for (const e of etapas) {
      expect(isTransicaoValida(e, 'DESCARTADO')).toBe(true);
    }
  });
});

describe('isTransicaoValida — bloqueios', () => {
  it('não pula etapas: RECEPCAO → ESTERILIZACAO é inválido', () => {
    expect(isTransicaoValida('RECEPCAO', 'ESTERILIZACAO')).toBe(false);
  });

  it('GUARDA → EM_USO direto é inválido (precisa passar por DISTRIBUICAO)', () => {
    expect(isTransicaoValida('GUARDA', 'EM_USO')).toBe(false);
  });

  it('DESCARTADO é terminal — nada sai dele', () => {
    expect(isTransicaoValida('DESCARTADO', 'RECEPCAO')).toBe(false);
    expect(isTransicaoValida('DESCARTADO', 'DESCARTADO')).toBe(false);
  });

  it('EM_USO só vai para RECEPCAO ou DESCARTADO', () => {
    expect(isTransicaoValida('EM_USO', 'LIMPEZA')).toBe(false);
    expect(isTransicaoValida('EM_USO', 'PREPARO')).toBe(false);
    expect(isTransicaoValida('EM_USO', 'RECEPCAO')).toBe(true);
    expect(isTransicaoValida('EM_USO', 'DESCARTADO')).toBe(true);
  });
});

describe('destinosValidos', () => {
  it('RECEPCAO permite LIMPEZA + DESCARTADO', () => {
    expect(destinosValidos('RECEPCAO').sort()).toEqual(
      ['DESCARTADO', 'LIMPEZA'].sort(),
    );
  });

  it('DESCARTADO retorna lista vazia', () => {
    expect(destinosValidos('DESCARTADO')).toEqual([]);
  });
});

describe('validateEmUsoArgs', () => {
  it('OK quando destino != EM_USO (não exige paciente)', () => {
    expect(validateEmUsoArgs({ destino: 'LIMPEZA' })).toBeNull();
  });

  it('falha quando destino = EM_USO sem paciente', () => {
    expect(
      validateEmUsoArgs({ destino: 'EM_USO', pacienteUuid: null }),
    ).toMatch(/paciente/i);
    expect(validateEmUsoArgs({ destino: 'EM_USO' })).toMatch(/paciente/i);
  });

  it('OK quando destino = EM_USO com paciente', () => {
    expect(
      validateEmUsoArgs({
        destino: 'EM_USO',
        pacienteUuid: '00000000-0000-4000-8000-000000000001',
      }),
    ).toBeNull();
  });
});
