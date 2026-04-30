/**
 * Testes do `LeitoStatusMachine` — cobre RN-INT-008.
 *
 * Cada cenário valida uma transição válida ou inválida de forma
 * isolada, garantindo a fronteira sem depender de banco.
 */
import { describe, expect, it } from 'vitest';
import { enum_leito_status as Status } from '@prisma/client';
import { LeitoStatusMachine } from '../infrastructure/leito-status.machine';

describe('LeitoStatusMachine', () => {
  describe('transições válidas', () => {
    it.each<[Status, Status]>([
      [Status.DISPONIVEL, Status.RESERVADO],
      [Status.DISPONIVEL, Status.OCUPADO],
      [Status.RESERVADO, Status.OCUPADO],
      [Status.RESERVADO, Status.DISPONIVEL],
      [Status.OCUPADO, Status.HIGIENIZACAO],
      [Status.HIGIENIZACAO, Status.DISPONIVEL],
      [Status.MANUTENCAO, Status.DISPONIVEL],
      [Status.BLOQUEADO, Status.DISPONIVEL],
    ])('%s → %s permitido', (from, to) => {
      expect(LeitoStatusMachine.canTransition(from, to)).toBe(true);
    });

    it.each<[Status, Status]>([
      [Status.DISPONIVEL, Status.MANUTENCAO],
      [Status.DISPONIVEL, Status.BLOQUEADO],
      [Status.RESERVADO, Status.MANUTENCAO],
      [Status.OCUPADO, Status.BLOQUEADO],
      [Status.HIGIENIZACAO, Status.MANUTENCAO],
    ])('admin pode forçar %s → %s', (from, to) => {
      expect(LeitoStatusMachine.canTransition(from, to)).toBe(true);
    });
  });

  describe('transições inválidas (devem rejeitar)', () => {
    it.each<[Status, Status]>([
      // OCUPADO não vai direto para DISPONIVEL — passa por HIGIENIZACAO.
      [Status.OCUPADO, Status.DISPONIVEL],
      // OCUPADO não pode reservar (está ocupado).
      [Status.OCUPADO, Status.RESERVADO],
      // HIGIENIZACAO não pode receber paciente direto.
      [Status.HIGIENIZACAO, Status.OCUPADO],
      [Status.HIGIENIZACAO, Status.RESERVADO],
      // MANUTENCAO/BLOQUEADO precisam voltar para DISPONIVEL primeiro.
      [Status.MANUTENCAO, Status.OCUPADO],
      [Status.MANUTENCAO, Status.RESERVADO],
      [Status.BLOQUEADO, Status.OCUPADO],
      [Status.BLOQUEADO, Status.RESERVADO],
      [Status.BLOQUEADO, Status.HIGIENIZACAO],
    ])('%s → %s rejeitado', (from, to) => {
      expect(LeitoStatusMachine.canTransition(from, to)).toBe(false);
    });

    it('rejeita identidade (mesmo estado)', () => {
      for (const s of Object.values(Status)) {
        expect(LeitoStatusMachine.canTransition(s, s)).toBe(false);
      }
    });
  });

  describe('nextStates', () => {
    it('DISPONIVEL inclui RESERVADO, OCUPADO, MANUTENCAO, BLOQUEADO', () => {
      const next = new Set(LeitoStatusMachine.nextStates(Status.DISPONIVEL));
      expect(next.has(Status.RESERVADO)).toBe(true);
      expect(next.has(Status.OCUPADO)).toBe(true);
      expect(next.has(Status.MANUTENCAO)).toBe(true);
      expect(next.has(Status.BLOQUEADO)).toBe(true);
      expect(next.has(Status.DISPONIVEL)).toBe(false);
    });

    it('OCUPADO permite HIGIENIZACAO + admin targets', () => {
      const next = new Set(LeitoStatusMachine.nextStates(Status.OCUPADO));
      expect(next.has(Status.HIGIENIZACAO)).toBe(true);
      expect(next.has(Status.MANUTENCAO)).toBe(true);
      expect(next.has(Status.BLOQUEADO)).toBe(true);
      expect(next.has(Status.DISPONIVEL)).toBe(false);
      expect(next.has(Status.RESERVADO)).toBe(false);
    });
  });
});
