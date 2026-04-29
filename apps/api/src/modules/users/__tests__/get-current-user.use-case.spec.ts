/**
 * Unit test do `GetCurrentUserUseCase` — apresenta o usuário sem
 * vazar campos sensíveis.
 */
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';

import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';

describe('GetCurrentUserUseCase', () => {
  it('retorna user com perfis sem expor senhaHash/mfaSecret', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      uuidExterno: '11111111-1111-4111-8111-111111111111',
      email: 'admin@hms.local',
      nome: 'Administrador',
      ativo: true,
      precisaTrocarSenha: true,
      mfaHabilitado: false,
      ultimoLoginEm: null,
      createdAt: new Date('2026-04-28T00:00:00Z'),
      updatedAt: null,
      // o presenter NUNCA deve expor estes:
      senhaHash: 'should-not-leak',
      mfaSecret: 'should-not-leak',
      perfis: [{ perfil: { codigo: 'ADMIN' } }],
    });
    const prisma = { tx: () => ({ usuario: { findFirst } }) };
    const useCase = new GetCurrentUserUseCase(prisma as never);

    const result = await useCase.execute(1n);

    expect(result.uuid).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.email).toBe('admin@hms.local');
    expect(result.perfis).toEqual(['ADMIN']);
    expect((result as Record<string, unknown>).senhaHash).toBeUndefined();
    expect((result as Record<string, unknown>).mfaSecret).toBeUndefined();
  });

  it('lança 404 quando usuário não existe', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { tx: () => ({ usuario: { findFirst } }) };
    const useCase = new GetCurrentUserUseCase(prisma as never);
    await expect(useCase.execute(99n)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
