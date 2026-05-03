/**
 * State machine pura de Prontuário (SAME).
 */
import { describe, expect, it } from 'vitest';

import { nextStatus, podeEmprestar } from '../domain/prontuario';

describe('nextStatus — prontuario', () => {
  it('ARQUIVADO → EMPRESTADO via emprestar', () => {
    expect(nextStatus('ARQUIVADO', 'emprestar')).toBe('EMPRESTADO');
  });

  it('DIGITALIZADO → EMPRESTADO via emprestar', () => {
    expect(nextStatus('DIGITALIZADO', 'emprestar')).toBe('EMPRESTADO');
  });

  it('EMPRESTADO não pode ser emprestado', () => {
    expect(nextStatus('EMPRESTADO', 'emprestar')).toBeNull();
  });

  it('EMPRESTADO → ARQUIVADO via devolver (default)', () => {
    expect(nextStatus('EMPRESTADO', 'devolver')).toBe('ARQUIVADO');
  });

  it('EMPRESTADO → DIGITALIZADO via devolver com previousStatus DIGITALIZADO', () => {
    expect(nextStatus('EMPRESTADO', 'devolver', 'DIGITALIZADO')).toBe(
      'DIGITALIZADO',
    );
  });

  it('ARQUIVADO → DIGITALIZADO via digitalizar', () => {
    expect(nextStatus('ARQUIVADO', 'digitalizar')).toBe('DIGITALIZADO');
  });

  it('DESCARTADO terminal — nada permitido', () => {
    expect(nextStatus('DESCARTADO', 'emprestar')).toBeNull();
    expect(nextStatus('DESCARTADO', 'digitalizar')).toBeNull();
    expect(nextStatus('DESCARTADO', 'descartar')).toBeNull();
  });

  it('descartar bloqueia EMPRESTADO', () => {
    expect(nextStatus('EMPRESTADO', 'descartar')).toBeNull();
  });
});

describe('podeEmprestar', () => {
  it('aceita ARQUIVADO e DIGITALIZADO', () => {
    expect(podeEmprestar('ARQUIVADO')).toBe(true);
    expect(podeEmprestar('DIGITALIZADO')).toBe(true);
  });

  it('rejeita EMPRESTADO e DESCARTADO', () => {
    expect(podeEmprestar('EMPRESTADO')).toBe(false);
    expect(podeEmprestar('DESCARTADO')).toBe(false);
  });
});
