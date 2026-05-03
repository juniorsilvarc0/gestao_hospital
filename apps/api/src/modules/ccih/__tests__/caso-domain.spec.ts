/**
 * Testes do domínio puro do caso CCIH — state machine.
 */
import { describe, expect, it } from 'vitest';

import {
  CCIH_TERMINAIS,
  nextCasoStatus,
} from '../domain/caso';

describe('nextCasoStatus', () => {
  it('ABERTO + tratar → EM_TRATAMENTO', () => {
    expect(nextCasoStatus('ABERTO', 'tratar')).toBe('EM_TRATAMENTO');
  });

  it('ABERTO + notificar → NOTIFICADO', () => {
    expect(nextCasoStatus('ABERTO', 'notificar')).toBe('NOTIFICADO');
  });

  it('EM_TRATAMENTO + notificar → NOTIFICADO', () => {
    expect(nextCasoStatus('EM_TRATAMENTO', 'notificar')).toBe('NOTIFICADO');
  });

  it('NOTIFICADO + tratar → EM_TRATAMENTO (volta para acompanhamento)', () => {
    expect(nextCasoStatus('NOTIFICADO', 'tratar')).toBe('EM_TRATAMENTO');
  });

  it('encerrar é válido a partir de qualquer não-terminal', () => {
    expect(nextCasoStatus('ABERTO', 'encerrar')).toBe('ENCERRADO');
    expect(nextCasoStatus('EM_TRATAMENTO', 'encerrar')).toBe('ENCERRADO');
    expect(nextCasoStatus('NOTIFICADO', 'encerrar')).toBe('ENCERRADO');
  });

  it('cancelar é válido a partir de qualquer não-terminal', () => {
    expect(nextCasoStatus('ABERTO', 'cancelar')).toBe('CANCELADO');
    expect(nextCasoStatus('NOTIFICADO', 'cancelar')).toBe('CANCELADO');
  });

  it('terminais não admitem transições', () => {
    expect(nextCasoStatus('ENCERRADO', 'tratar')).toBeNull();
    expect(nextCasoStatus('ENCERRADO', 'notificar')).toBeNull();
    expect(nextCasoStatus('ENCERRADO', 'encerrar')).toBeNull();
    expect(nextCasoStatus('CANCELADO', 'tratar')).toBeNull();
  });

  it('NOTIFICADO + notificar é null (já notificado)', () => {
    expect(nextCasoStatus('NOTIFICADO', 'notificar')).toBeNull();
  });

  it('EM_TRATAMENTO + tratar é null (já está em tratamento)', () => {
    expect(nextCasoStatus('EM_TRATAMENTO', 'tratar')).toBeNull();
  });
});

describe('CCIH_TERMINAIS', () => {
  it('contém ENCERRADO e CANCELADO apenas', () => {
    expect(CCIH_TERMINAIS.has('ENCERRADO')).toBe(true);
    expect(CCIH_TERMINAIS.has('CANCELADO')).toBe(true);
    expect(CCIH_TERMINAIS.has('ABERTO')).toBe(false);
    expect(CCIH_TERMINAIS.has('EM_TRATAMENTO')).toBe(false);
    expect(CCIH_TERMINAIS.has('NOTIFICADO')).toBe(false);
  });
});
