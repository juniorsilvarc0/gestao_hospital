/**
 * Testa `RevogarConsentimentoUseCase`:
 *   - Não encontrado → 404.
 *   - Já revogado → 409.
 *   - Motivo inválido → 409.
 *   - OK → atualiza + audit `lgpd.consentimento.revogado`.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RevogarConsentimentoUseCase } from '../application/consentimentos/revogar-consentimento.use-case';

const ctxOk = {
  userId: 1n,
  tenantId: 7n,
  pacienteId: 99n,
  pacienteUuid: '00000000-0000-0000-0000-000000000099',
};

function makeResolver() {
  return { resolve: vi.fn(async () => ctxOk) };
}
function makeAuditoria() {
  return { record: vi.fn(async () => undefined) };
}

describe('RevogarConsentimentoUseCase', () => {
  let resolver: ReturnType<typeof makeResolver>;
  let auditoria: ReturnType<typeof makeAuditoria>;

  beforeEach(() => {
    resolver = makeResolver();
    auditoria = makeAuditoria();
  });

  it('rejeita motivo curto', async () => {
    const repo = {
      findConsentimentoByUuid: vi.fn(),
      updateRevogacaoConsentimento: vi.fn(),
      listConsentimentosPaciente: vi.fn(async () => []),
    };
    const uc = new RevogarConsentimentoUseCase(
      resolver as never,
      repo as never,
      auditoria as never,
    );
    await expect(
      uc.execute('00000000-0000-4000-8000-000000000001', { motivo: 'hi' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.findConsentimentoByUuid).not.toHaveBeenCalled();
  });

  it('rejeita 404 quando consentimento não pertence ao paciente', async () => {
    const repo = {
      findConsentimentoByUuid: vi.fn(async () => null),
      updateRevogacaoConsentimento: vi.fn(),
      listConsentimentosPaciente: vi.fn(async () => []),
    };
    const uc = new RevogarConsentimentoUseCase(
      resolver as never,
      repo as never,
      auditoria as never,
    );
    await expect(
      uc.execute('00000000-0000-4000-8000-000000000001', {
        motivo: 'motivo válido',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita 409 quando já revogado', async () => {
    const repo = {
      findConsentimentoByUuid: vi.fn(async () => ({
        id: 10n,
        data_revogacao: new Date('2026-01-01T00:00:00Z'),
      })),
      updateRevogacaoConsentimento: vi.fn(),
      listConsentimentosPaciente: vi.fn(async () => []),
    };
    const uc = new RevogarConsentimentoUseCase(
      resolver as never,
      repo as never,
      auditoria as never,
    );
    await expect(
      uc.execute('00000000-0000-4000-8000-000000000001', {
        motivo: 'motivo válido',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONSENTIMENTO_JA_REVOGADO' },
    });
  });

  it('atualiza + audit + retorna estado revogado', async () => {
    const repo = {
      findConsentimentoByUuid: vi.fn(async () => ({
        id: 10n,
        data_revogacao: null,
      })),
      updateRevogacaoConsentimento: vi.fn(async () => undefined),
      listConsentimentosPaciente: vi.fn(async () => [
        {
          id: 10n,
          uuid_externo: 'cafeface-cafe-4cae-8cae-cafecafecafe',
          finalidade: 'COMUNICACAO_MARKETING',
          versao_termo: 'v1',
          aceito: true,
          data_decisao: new Date('2026-01-01T00:00:00Z'),
          data_revogacao: new Date('2026-05-01T12:00:00Z'),
          motivo_revogacao: 'motivo válido',
        },
      ]),
    };
    const uc = new RevogarConsentimentoUseCase(
      resolver as never,
      repo as never,
      auditoria as never,
    );
    const out = await uc.execute('cafeface-cafe-4cae-8cae-cafecafecafe', {
      motivo: 'motivo válido',
    });
    expect(out.uuid).toBe('cafeface-cafe-4cae-8cae-cafecafecafe');
    expect(out.dataRevogacao).toBe('2026-05-01T12:00:00.000Z');
    expect(out.ativo).toBe(false);
    expect(repo.updateRevogacaoConsentimento).toHaveBeenCalledWith({
      id: 10n,
      motivo: 'motivo válido',
    });
    expect(auditoria.record).toHaveBeenCalledWith(
      expect.objectContaining({
        finalidade: 'lgpd.consentimento.revogado',
      }),
    );
  });
});
