/**
 * Testes do domínio puro de Glosa — state machine + validação de
 * valor_revertido + utilitários de prazo.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultPrazoRecurso,
  diasAtePrazo,
  isPrazoVencido,
  nextStatus,
  validateValorRevertido,
} from '../domain/glosa';
import {
  inferMotivoGlosa,
  isMotivoGenerico,
} from '../domain/motivo-inferencer';

describe('nextStatus — state machine', () => {
  it('RECEBIDA → EM_RECURSO via enviar_recurso', () => {
    expect(nextStatus('RECEBIDA', 'enviar_recurso')).toBe('EM_RECURSO');
  });

  it('EM_RECURSO → REVERTIDA_TOTAL via finalizar', () => {
    expect(nextStatus('EM_RECURSO', 'finalizar', 'REVERTIDA_TOTAL')).toBe(
      'REVERTIDA_TOTAL',
    );
  });

  it('RECEBIDA → PERDA_DEFINITIVA via finalizar (sem recurso)', () => {
    expect(nextStatus('RECEBIDA', 'finalizar', 'PERDA_DEFINITIVA')).toBe(
      'PERDA_DEFINITIVA',
    );
  });

  it('terminal não admite transições', () => {
    expect(nextStatus('REVERTIDA_TOTAL', 'enviar_recurso')).toBeNull();
    expect(nextStatus('ACATADA', 'finalizar', 'REVERTIDA_TOTAL')).toBeNull();
    expect(nextStatus('PERDA_DEFINITIVA', 'analisar')).toBeNull();
  });

  it('finalizar exige finalizacao', () => {
    expect(nextStatus('EM_RECURSO', 'finalizar')).toBeNull();
  });
});

describe('validateValorRevertido (RN-GLO-04)', () => {
  it('REVERTIDA_TOTAL exige valor_revertido = valor_glosado', () => {
    expect(validateValorRevertido('REVERTIDA_TOTAL', 100, 100)).toBeNull();
    expect(validateValorRevertido('REVERTIDA_TOTAL', 100, 50)).toMatch(
      /REVERTIDA_TOTAL/,
    );
  });

  it('REVERTIDA_PARCIAL exige 0 < valor_revertido < valor_glosado', () => {
    expect(validateValorRevertido('REVERTIDA_PARCIAL', 100, 50)).toBeNull();
    expect(validateValorRevertido('REVERTIDA_PARCIAL', 100, 0)).toMatch(
      /REVERTIDA_PARCIAL/,
    );
    expect(validateValorRevertido('REVERTIDA_PARCIAL', 100, 100)).toMatch(
      /REVERTIDA_PARCIAL/,
    );
  });

  it('ACATADA / PERDA_DEFINITIVA exige valor_revertido = 0', () => {
    expect(validateValorRevertido('ACATADA', 100, 0)).toBeNull();
    expect(validateValorRevertido('PERDA_DEFINITIVA', 100, 0)).toBeNull();
    expect(validateValorRevertido('ACATADA', 100, 10)).toMatch(/ACATADA/);
  });

  it('valor_revertido > valor_glosado é sempre erro', () => {
    expect(validateValorRevertido('REVERTIDA_TOTAL', 100, 200)).toMatch(
      /exceder/,
    );
  });
});

describe('defaultPrazoRecurso', () => {
  it('soma 30 dias à data informada (UTC)', () => {
    expect(defaultPrazoRecurso('2026-01-01')).toBe('2026-01-31');
    expect(defaultPrazoRecurso('2026-02-01')).toBe('2026-03-03');
  });

  it('rejeita data inválida', () => {
    expect(() => defaultPrazoRecurso('not-a-date')).toThrow();
  });
});

describe('isPrazoVencido / diasAtePrazo', () => {
  const fixed = new Date('2026-05-01T12:00:00Z');

  it('vencido se prazo < today', () => {
    expect(isPrazoVencido('2026-04-01', fixed)).toBe(true);
    expect(isPrazoVencido('2026-05-01', fixed)).toBe(false);
    expect(isPrazoVencido('2026-06-01', fixed)).toBe(false);
  });

  it('null prazo nunca está vencido', () => {
    expect(isPrazoVencido(null, fixed)).toBe(false);
  });

  it('diasAtePrazo conta dias UTC', () => {
    expect(diasAtePrazo('2026-05-08', fixed)).toBe(7);
    expect(diasAtePrazo('2026-05-04', fixed)).toBe(3);
    expect(diasAtePrazo('2026-05-01', fixed)).toBe(0);
    expect(diasAtePrazo('2026-04-28', fixed)).toBe(-3);
  });
});

describe('inferMotivoGlosa (RN-GLO-06)', () => {
  it('mapeia código exato', () => {
    expect(inferMotivoGlosa('1001').motivo).toBe('CADASTRO');
    expect(inferMotivoGlosa('3001').motivo).toBe('AUTORIZACAO');
    expect(inferMotivoGlosa('4001').motivo).toBe('PRECO');
  });

  it('cai no fallback por prefixo', () => {
    expect(inferMotivoGlosa('2999').motivo).toBe('CODIGO');
    expect(inferMotivoGlosa('5500').motivo).toBe('LIMITE_CONTRATUAL');
  });

  it('null/vazio retorna INDETERMINADO', () => {
    expect(inferMotivoGlosa(null).motivo).toBe('INDETERMINADO');
    expect(inferMotivoGlosa('').motivo).toBe('INDETERMINADO');
    expect(inferMotivoGlosa('  ').motivo).toBe('INDETERMINADO');
  });

  it('código não mapeado e prefixo não conhecido', () => {
    expect(inferMotivoGlosa('7777').motivo).toBe('INDETERMINADO');
  });
});

describe('isMotivoGenerico', () => {
  it('motivos curtos ou genéricos retornam true', () => {
    expect(isMotivoGenerico(null)).toBe(true);
    expect(isMotivoGenerico('')).toBe(true);
    expect(isMotivoGenerico('n/a')).toBe(true);
    expect(isMotivoGenerico('glosa')).toBe(true);
    expect(isMotivoGenerico('Glosa TISS')).toBe(true);
  });

  it('motivos descritivos retornam false', () => {
    expect(isMotivoGenerico('Procedimento sem autorização prévia')).toBe(
      false,
    );
    expect(isMotivoGenerico('Valor unitário acima da tabela contratada')).toBe(
      false,
    );
  });
});
