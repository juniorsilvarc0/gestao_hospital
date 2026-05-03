/**
 * Testes do domínio puro do Artigo CME — invariantes da movimentação.
 */
import { describe, expect, it } from 'vitest';

import { validateMovimentacao } from '../domain/artigo';

const PACIENTE = '00000000-0000-4000-8000-000000000001';

describe('validateMovimentacao', () => {
  it('OK: ESTERILIZACAO → GUARDA com lote LIBERADO', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'ESTERILIZACAO',
        etapaDestino: 'GUARDA',
        loteStatus: 'LIBERADO',
      }),
    ).toBeNull();
  });

  it('falha: ESTERILIZACAO → GUARDA com lote != LIBERADO', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'ESTERILIZACAO',
        etapaDestino: 'GUARDA',
        loteStatus: 'EM_PROCESSAMENTO',
      }),
    ).toMatch(/LIBERADO/);
    expect(
      validateMovimentacao({
        etapaAtual: 'ESTERILIZACAO',
        etapaDestino: 'GUARDA',
        loteStatus: 'AGUARDANDO_INDICADOR',
      }),
    ).toMatch(/LIBERADO/);
  });

  it('falha: transição inválida (RECEPCAO → ESTERILIZACAO)', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'RECEPCAO',
        etapaDestino: 'ESTERILIZACAO',
        loteStatus: 'EM_PROCESSAMENTO',
      }),
    ).toMatch(/não é válida/);
  });

  it('lote REPROVADO: só permite DESCARTADO', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'GUARDA',
        etapaDestino: 'DESCARTADO',
        loteStatus: 'REPROVADO',
      }),
    ).toBeNull();
    expect(
      validateMovimentacao({
        etapaAtual: 'GUARDA',
        etapaDestino: 'DISTRIBUICAO',
        loteStatus: 'REPROVADO',
      }),
    ).toMatch(/REPROVADO/);
  });

  it('lote EXPIRADO: só permite DESCARTADO', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'GUARDA',
        etapaDestino: 'DESCARTADO',
        loteStatus: 'EXPIRADO',
      }),
    ).toBeNull();
    expect(
      validateMovimentacao({
        etapaAtual: 'GUARDA',
        etapaDestino: 'DISTRIBUICAO',
        loteStatus: 'EXPIRADO',
      }),
    ).toMatch(/EXPIRADO/);
  });

  it('EM_USO exige paciente (RN-CME-05)', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'DISTRIBUICAO',
        etapaDestino: 'EM_USO',
        loteStatus: 'LIBERADO',
      }),
    ).toMatch(/paciente/i);
    expect(
      validateMovimentacao({
        etapaAtual: 'DISTRIBUICAO',
        etapaDestino: 'EM_USO',
        loteStatus: 'LIBERADO',
        pacienteUuid: PACIENTE,
      }),
    ).toBeNull();
  });

  it('OK: EM_USO → RECEPCAO (volta para reprocessar)', () => {
    expect(
      validateMovimentacao({
        etapaAtual: 'EM_USO',
        etapaDestino: 'RECEPCAO',
        loteStatus: 'LIBERADO',
      }),
    ).toBeNull();
  });
});
