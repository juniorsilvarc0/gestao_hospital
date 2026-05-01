import { describe, expect, it } from 'vitest';

import { validarSinaisVitais } from '../application/sinais-vitais.validator';

describe('validarSinaisVitais', () => {
  it('aceita conjunto fisiologicamente coerente', () => {
    const fora = validarSinaisVitais({
      paSistolica: 120,
      paDiastolica: 80,
      fc: 80,
      fr: 16,
      temperatura: 36.6,
      satO2: 98,
      glicemia: 95,
      dorEva: 3,
    });
    expect(fora).toEqual([]);
  });

  it('detecta PA fora da faixa fisiológica', () => {
    const fora = validarSinaisVitais({ paSistolica: 30, paDiastolica: 20 });
    expect(fora.length).toBeGreaterThan(0);
    expect(fora.some((f) => f.campo === 'paSistolica')).toBe(true);
  });

  it('detecta PA com sistólica <= diastólica', () => {
    const fora = validarSinaisVitais({ paSistolica: 80, paDiastolica: 90 });
    expect(fora.some((f) => f.campo === 'paSistolica_vs_paDiastolica')).toBe(
      true,
    );
  });

  it('detecta SatO2 fora', () => {
    const fora = validarSinaisVitais({ satO2: 30 });
    expect(fora.some((f) => f.campo === 'satO2')).toBe(true);
  });

  it('ignora campos não enviados', () => {
    const fora = validarSinaisVitais({});
    expect(fora).toEqual([]);
  });

  it('detecta temperatura crítica (acima)', () => {
    const fora = validarSinaisVitais({ temperatura: 50 });
    expect(fora.some((f) => f.campo === 'temperatura')).toBe(true);
  });

  it('detecta EVA fora', () => {
    const fora = validarSinaisVitais({ dorEva: 11 });
    expect(fora.some((f) => f.campo === 'dorEva')).toBe(true);
  });
});
