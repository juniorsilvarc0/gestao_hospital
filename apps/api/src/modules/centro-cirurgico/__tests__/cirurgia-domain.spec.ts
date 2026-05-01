/**
 * Unit do domínio Cirurgia — state machine.
 *
 * Cobre as transições válidas e proíbe os atalhos não-suportados:
 *   - AGENDADA → CONFIRMADA → EM_ANDAMENTO → CONCLUIDA (caminho feliz).
 *   - cancelar é permitido em qualquer estado não-terminal.
 *   - encerrar só é permitido a partir de EM_ANDAMENTO.
 */
import { describe, expect, it } from 'vitest';

import { nextCirurgiaStatus } from '../domain/cirurgia';
import {
  podeUtilizarSemAutorizacao,
  type OpmeItem,
} from '../domain/opme';
import { temCirurgiao } from '../domain/equipe-cirurgica';

describe('domain/cirurgia — nextCirurgiaStatus', () => {
  it('AGENDADA → CONFIRMADA via confirmar', () => {
    expect(nextCirurgiaStatus('AGENDADA', 'confirmar')).toBe('CONFIRMADA');
  });

  it('confirmar é proibido fora de AGENDADA', () => {
    expect(nextCirurgiaStatus('CONFIRMADA', 'confirmar')).toBeNull();
    expect(nextCirurgiaStatus('EM_ANDAMENTO', 'confirmar')).toBeNull();
    expect(nextCirurgiaStatus('CONCLUIDA', 'confirmar')).toBeNull();
    expect(nextCirurgiaStatus('CANCELADA', 'confirmar')).toBeNull();
  });

  it('iniciar exige CONFIRMADA', () => {
    expect(nextCirurgiaStatus('CONFIRMADA', 'iniciar')).toBe('EM_ANDAMENTO');
    expect(nextCirurgiaStatus('AGENDADA', 'iniciar')).toBeNull();
    expect(nextCirurgiaStatus('EM_ANDAMENTO', 'iniciar')).toBeNull();
  });

  it('encerrar exige EM_ANDAMENTO', () => {
    expect(nextCirurgiaStatus('EM_ANDAMENTO', 'encerrar')).toBe('CONCLUIDA');
    expect(nextCirurgiaStatus('CONFIRMADA', 'encerrar')).toBeNull();
    expect(nextCirurgiaStatus('AGENDADA', 'encerrar')).toBeNull();
    expect(nextCirurgiaStatus('CONCLUIDA', 'encerrar')).toBeNull();
  });

  it('cancelar permitido em AGENDADA / CONFIRMADA / EM_ANDAMENTO / SUSPENSA', () => {
    expect(nextCirurgiaStatus('AGENDADA', 'cancelar')).toBe('CANCELADA');
    expect(nextCirurgiaStatus('CONFIRMADA', 'cancelar')).toBe('CANCELADA');
    expect(nextCirurgiaStatus('EM_ANDAMENTO', 'cancelar')).toBe('CANCELADA');
    expect(nextCirurgiaStatus('SUSPENSA', 'cancelar')).toBe('CANCELADA');
  });

  it('cancelar terminal é proibido', () => {
    expect(nextCirurgiaStatus('CONCLUIDA', 'cancelar')).toBeNull();
    expect(nextCirurgiaStatus('CANCELADA', 'cancelar')).toBeNull();
  });

  it('suspender / reagendar', () => {
    expect(nextCirurgiaStatus('AGENDADA', 'suspender')).toBe('SUSPENSA');
    expect(nextCirurgiaStatus('CONFIRMADA', 'suspender')).toBe('SUSPENSA');
    expect(nextCirurgiaStatus('SUSPENSA', 'reagendar')).toBe('AGENDADA');
    expect(nextCirurgiaStatus('AGENDADA', 'reagendar')).toBeNull();
  });
});

describe('domain/equipe-cirurgica — temCirurgiao', () => {
  it('aceita variações maiúsc/minúsc', () => {
    expect(
      temCirurgiao([
        { prestadorUuid: 'a', funcao: 'CIRURGIAO' },
        { prestadorUuid: 'b', funcao: 'AUXILIAR_1' },
      ]),
    ).toBe(true);
    expect(
      temCirurgiao([{ prestadorUuid: 'a', funcao: 'cirurgiao' }]),
    ).toBe(true);
  });

  it('rejeita lista sem cirurgião', () => {
    expect(
      temCirurgiao([
        { prestadorUuid: 'a', funcao: 'AUXILIAR_1' },
        { prestadorUuid: 'b', funcao: 'ANESTESISTA' },
      ]),
    ).toBe(false);
  });
});

describe('domain/opme — podeUtilizarSemAutorizacao', () => {
  const itensOk: OpmeItem[] = [
    { descricao: 'Parafuso', quantidade: 2, motivoUrgencia: 'fratura grave' },
  ];
  const itensSemMotivo: OpmeItem[] = [
    { descricao: 'Parafuso', quantidade: 2 },
  ];

  it('com autorização registrada → ok', () => {
    expect(
      podeUtilizarSemAutorizacao({
        classificacao: 'ELETIVA',
        autorizadaTemRegistros: true,
        itens: itensSemMotivo,
      }),
    ).toEqual({ ok: true });
  });

  it('ELETIVA sem autorização → bloqueia', () => {
    const r = podeUtilizarSemAutorizacao({
      classificacao: 'ELETIVA',
      autorizadaTemRegistros: false,
      itens: itensOk,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('OPME_AUTORIZACAO_REQUIRED');
  });

  it('EMERGENCIA sem motivo no item → bloqueia', () => {
    const r = podeUtilizarSemAutorizacao({
      classificacao: 'EMERGENCIA',
      autorizadaTemRegistros: false,
      itens: itensSemMotivo,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('OPME_EMERGENCIA_SEM_MOTIVO');
  });

  it('EMERGENCIA com motivo em todos os itens → ok', () => {
    expect(
      podeUtilizarSemAutorizacao({
        classificacao: 'EMERGENCIA',
        autorizadaTemRegistros: false,
        itens: itensOk,
      }),
    ).toEqual({ ok: true });
  });
});
