/**
 * Testes do domínio puro de Conta — state machine + helpers de
 * inconsistência.
 */
import { describe, expect, it } from 'vitest';

import { nextContaStatus } from '../domain/conta';
import {
  temInconsistenciaBloqueante,
  type Inconsistencia,
} from '../domain/inconsistencia';
import { pacoteFaltantes } from '../domain/pacote';

describe('nextContaStatus — state machine', () => {
  it('ABERTA → EM_ELABORACAO via elaborar', () => {
    expect(nextContaStatus('ABERTA', 'elaborar')).toBe('EM_ELABORACAO');
  });

  it('EM_ELABORACAO → FECHADA via fechar', () => {
    expect(nextContaStatus('EM_ELABORACAO', 'fechar')).toBe('FECHADA');
  });

  it('FECHADA → ABERTA via reabrir', () => {
    expect(nextContaStatus('FECHADA', 'reabrir')).toBe('ABERTA');
  });

  it('ABERTA / EM_ELABORACAO → CANCELADA via cancelar', () => {
    expect(nextContaStatus('ABERTA', 'cancelar')).toBe('CANCELADA');
    expect(nextContaStatus('EM_ELABORACAO', 'cancelar')).toBe('CANCELADA');
  });

  it('FECHADA → FATURADA via faturar', () => {
    expect(nextContaStatus('FECHADA', 'faturar')).toBe('FATURADA');
  });

  it('FATURADA / GLOSADA_PARCIAL / GLOSADA_TOTAL → PAGA via pagar', () => {
    expect(nextContaStatus('FATURADA', 'pagar')).toBe('PAGA');
    expect(nextContaStatus('GLOSADA_PARCIAL', 'pagar')).toBe('PAGA');
    expect(nextContaStatus('GLOSADA_TOTAL', 'pagar')).toBe('PAGA');
  });

  it('reabrir não funciona após FATURADA', () => {
    expect(nextContaStatus('FATURADA', 'reabrir')).toBeNull();
    expect(nextContaStatus('PAGA', 'reabrir')).toBeNull();
  });

  it('cancelar não funciona após FECHADA', () => {
    expect(nextContaStatus('FECHADA', 'cancelar')).toBeNull();
    expect(nextContaStatus('FATURADA', 'cancelar')).toBeNull();
  });

  it('CANCELADA é terminal', () => {
    expect(nextContaStatus('CANCELADA', 'elaborar')).toBeNull();
    expect(nextContaStatus('CANCELADA', 'fechar')).toBeNull();
  });

  it('elaborar idempotência: EM_ELABORACAO → null (use case decide refresh)', () => {
    expect(nextContaStatus('EM_ELABORACAO', 'elaborar')).toBeNull();
  });
});

describe('temInconsistenciaBloqueante', () => {
  it('true se houver alguma com severidade=erro', () => {
    const incs: Inconsistencia[] = [
      { severidade: 'warning', codigo: 'VALOR_ZERO', mensagem: 'x' },
      { severidade: 'erro', codigo: 'ITEM_SEM_PRESTADOR', mensagem: 'y' },
    ];
    expect(temInconsistenciaBloqueante(incs)).toBe(true);
  });

  it('false quando só warnings/info', () => {
    const incs: Inconsistencia[] = [
      { severidade: 'warning', codigo: 'VALOR_ZERO', mensagem: 'x' },
      { severidade: 'info', codigo: 'ITEM_DUPLICADO', mensagem: 'y' },
    ];
    expect(temInconsistenciaBloqueante(incs)).toBe(false);
  });

  it('false em lista vazia', () => {
    expect(temInconsistenciaBloqueante([])).toBe(false);
  });
});

describe('pacoteFaltantes', () => {
  it('detecta itens faltantes', () => {
    const f = pacoteFaltantes({
      itensPrevistos: [
        { procedimentoId: 1n, quantidade: 2 },
        { procedimentoId: 2n, quantidade: 1 },
      ],
      itensLancados: [{ procedimentoId: 1n, quantidade: 1 }],
    });
    expect(f).toHaveLength(2);
  });

  it('retorna vazio quando todos lançados', () => {
    const f = pacoteFaltantes({
      itensPrevistos: [{ procedimentoId: 1n, quantidade: 2 }],
      itensLancados: [
        { procedimentoId: 1n, quantidade: 1 },
        { procedimentoId: 1n, quantidade: 1 },
      ],
    });
    expect(f).toHaveLength(0);
  });
});
