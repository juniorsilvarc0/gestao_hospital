/**
 * Testes do domínio puro de Lote CME — state machine + RN-CME-01.
 */
import { describe, expect, it } from 'vitest';

import {
  CME_LOTE_NAO_TERMINAIS,
  nextLoteStatus,
  validateLiberacao,
} from '../domain/lote';

describe('nextLoteStatus — state machine do lote', () => {
  it('EM_PROCESSAMENTO + liberar → LIBERADO', () => {
    expect(nextLoteStatus('EM_PROCESSAMENTO', 'liberar')).toBe('LIBERADO');
  });

  it('AGUARDANDO_INDICADOR + liberar → LIBERADO', () => {
    expect(nextLoteStatus('AGUARDANDO_INDICADOR', 'liberar')).toBe('LIBERADO');
  });

  it('EM_PROCESSAMENTO + reprovar → REPROVADO', () => {
    expect(nextLoteStatus('EM_PROCESSAMENTO', 'reprovar')).toBe('REPROVADO');
  });

  it('LIBERADO + marcar_expirado → EXPIRADO', () => {
    expect(nextLoteStatus('LIBERADO', 'marcar_expirado')).toBe('EXPIRADO');
  });

  it('LIBERADO não admite liberar/reprovar (já decidido)', () => {
    expect(nextLoteStatus('LIBERADO', 'liberar')).toBeNull();
    expect(nextLoteStatus('LIBERADO', 'reprovar')).toBeNull();
  });

  it('REPROVADO é terminal (exceto que pode marcar_expirado? não)', () => {
    expect(nextLoteStatus('REPROVADO', 'liberar')).toBeNull();
    expect(nextLoteStatus('REPROVADO', 'reprovar')).toBeNull();
    expect(nextLoteStatus('REPROVADO', 'marcar_expirado')).toBeNull();
  });

  it('EXPIRADO é terminal', () => {
    expect(nextLoteStatus('EXPIRADO', 'liberar')).toBeNull();
    expect(nextLoteStatus('EXPIRADO', 'reprovar')).toBeNull();
    expect(nextLoteStatus('EXPIRADO', 'marcar_expirado')).toBeNull();
  });

  it('marcar_expirado só vale a partir de LIBERADO', () => {
    expect(nextLoteStatus('EM_PROCESSAMENTO', 'marcar_expirado')).toBeNull();
    expect(nextLoteStatus('AGUARDANDO_INDICADOR', 'marcar_expirado')).toBeNull();
  });
});

describe('CME_LOTE_NAO_TERMINAIS', () => {
  it('contém apenas EM_PROCESSAMENTO e AGUARDANDO_INDICADOR', () => {
    expect(CME_LOTE_NAO_TERMINAIS.has('EM_PROCESSAMENTO')).toBe(true);
    expect(CME_LOTE_NAO_TERMINAIS.has('AGUARDANDO_INDICADOR')).toBe(true);
    expect(CME_LOTE_NAO_TERMINAIS.has('LIBERADO')).toBe(false);
    expect(CME_LOTE_NAO_TERMINAIS.has('REPROVADO')).toBe(false);
    expect(CME_LOTE_NAO_TERMINAIS.has('EXPIRADO')).toBe(false);
  });
});

describe('validateLiberacao (RN-CME-01)', () => {
  it('OK quando status não-terminal e indicador biológico TRUE', () => {
    expect(validateLiberacao('EM_PROCESSAMENTO', true)).toBeNull();
    expect(validateLiberacao('AGUARDANDO_INDICADOR', true)).toBeNull();
  });

  it('falha quando indicador biológico FALSE', () => {
    expect(validateLiberacao('EM_PROCESSAMENTO', false)).toMatch(
      /indicador biológico/i,
    );
  });

  it('falha quando status já decidido (LIBERADO/REPROVADO/EXPIRADO)', () => {
    expect(validateLiberacao('LIBERADO', true)).toMatch(/LIBERADO/);
    expect(validateLiberacao('REPROVADO', true)).toMatch(/REPROVADO/);
    expect(validateLiberacao('EXPIRADO', true)).toMatch(/EXPIRADO/);
  });
});
