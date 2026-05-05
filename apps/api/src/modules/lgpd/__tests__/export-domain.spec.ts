/**
 * Testes do domínio puro `export.ts` — state machine RN-LGP-04.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultDataExpiracao,
  isExportExpirado,
  isTerminal,
  transition,
  type LgpdExportStatus,
} from '../domain/export';

describe('LGPD export — state machine', () => {
  describe('transition', () => {
    it('AGUARDANDO_APROVACAO_DPO + aprovar_dpo → AGUARDANDO_APROVACAO_SUPERVISOR', () => {
      const r = transition('AGUARDANDO_APROVACAO_DPO', 'aprovar_dpo');
      expect(r.next).toBe('AGUARDANDO_APROVACAO_SUPERVISOR');
      expect(r.motivo).toBeNull();
    });

    it('AGUARDANDO_APROVACAO_SUPERVISOR + aprovar_supervisor → APROVADO', () => {
      const r = transition('AGUARDANDO_APROVACAO_SUPERVISOR', 'aprovar_supervisor');
      expect(r.next).toBe('APROVADO');
    });

    it('APROVADO + gerar → GERANDO', () => {
      const r = transition('APROVADO', 'gerar');
      expect(r.next).toBe('GERANDO');
    });

    it('GERANDO + concluir_geracao → PRONTO_PARA_DOWNLOAD', () => {
      const r = transition('GERANDO', 'concluir_geracao');
      expect(r.next).toBe('PRONTO_PARA_DOWNLOAD');
    });

    it('PRONTO_PARA_DOWNLOAD + baixar → BAIXADO', () => {
      const r = transition('PRONTO_PARA_DOWNLOAD', 'baixar');
      expect(r.next).toBe('BAIXADO');
    });

    it('rejeita transições fora de ordem (ex.: aprovar_supervisor antes do DPO)', () => {
      const r = transition('AGUARDANDO_APROVACAO_DPO', 'aprovar_supervisor');
      expect(r.next).toBeNull();
      expect(r.motivo).toContain('Apenas a action `aprovar_dpo`');
    });

    it('rejeita gerar sem aprovação', () => {
      const r = transition('AGUARDANDO_APROVACAO_DPO', 'gerar');
      expect(r.next).toBeNull();
    });

    it('rejeitar é permitido nos 3 status pré-APROVADO + APROVADO', () => {
      const allowed: LgpdExportStatus[] = [
        'AGUARDANDO_APROVACAO_DPO',
        'AGUARDANDO_APROVACAO_SUPERVISOR',
        'APROVADO',
      ];
      for (const s of allowed) {
        const r = transition(s, 'rejeitar');
        expect(r.next).toBe('REJEITADO');
      }
    });

    it('rejeitar bloqueia em terminais', () => {
      const blocked: LgpdExportStatus[] = ['BAIXADO', 'EXPIRADO', 'REJEITADO'];
      for (const s of blocked) {
        const r = transition(s, 'rejeitar');
        expect(r.next).toBeNull();
      }
    });

    it('expirar só funciona em PRONTO_PARA_DOWNLOAD', () => {
      expect(transition('PRONTO_PARA_DOWNLOAD', 'expirar').next).toBe(
        'EXPIRADO',
      );
      expect(transition('APROVADO', 'expirar').next).toBeNull();
    });

    it('terminais não fazem mais transição', () => {
      const terminais: LgpdExportStatus[] = [
        'BAIXADO',
        'EXPIRADO',
        'REJEITADO',
      ];
      for (const s of terminais) {
        expect(isTerminal(s)).toBe(true);
        expect(transition(s, 'aprovar_dpo').next).toBeNull();
      }
    });
  });

  describe('isExportExpirado', () => {
    it('PRONTO + dataExpiracao no passado → true', () => {
      expect(
        isExportExpirado({
          status: 'PRONTO_PARA_DOWNLOAD',
          dataExpiracao: new Date('2020-01-01T00:00:00Z'),
          agora: new Date('2026-05-04T00:00:00Z'),
        }),
      ).toBe(true);
    });

    it('PRONTO + dataExpiracao no futuro → false', () => {
      expect(
        isExportExpirado({
          status: 'PRONTO_PARA_DOWNLOAD',
          dataExpiracao: new Date('2030-05-04T00:00:00Z'),
          agora: new Date('2026-05-04T00:00:00Z'),
        }),
      ).toBe(false);
    });

    it('status diferente de PRONTO nunca expira pela função', () => {
      expect(
        isExportExpirado({
          status: 'APROVADO',
          dataExpiracao: new Date('2020-01-01'),
        }),
      ).toBe(false);
    });

    it('dataExpiracao null → false', () => {
      expect(
        isExportExpirado({
          status: 'PRONTO_PARA_DOWNLOAD',
          dataExpiracao: null,
        }),
      ).toBe(false);
    });
  });

  describe('defaultDataExpiracao', () => {
    it('soma 7 dias à data informada (RN-LGP-04)', () => {
      const d = defaultDataExpiracao(new Date('2026-05-04T10:00:00Z'));
      // 2026-05-11T10:00:00Z
      expect(d.toISOString()).toBe('2026-05-11T10:00:00.000Z');
    });
  });
});
