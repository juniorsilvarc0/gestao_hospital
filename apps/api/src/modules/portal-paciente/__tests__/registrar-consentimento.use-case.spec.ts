/**
 * Testa `RegistrarConsentimentoUseCase`:
 *   - Idempotência via UNIQUE: já existente → 409.
 *   - Validações de domínio (finalidade/versao/texto).
 *   - Audit `lgpd.consentimento.registrado` é chamado.
 */
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrarConsentimentoUseCase } from '../application/consentimentos/registrar-consentimento.use-case';

const ctxOk = {
  userId: 1n,
  tenantId: 7n,
  pacienteId: 99n,
  pacienteUuid: '00000000-0000-0000-0000-000000000099',
};

function makeResolver() {
  return { resolve: vi.fn(async () => ctxOk) };
}

function makeRepo(opts: { existente?: { id: bigint; uuid_externo: string } | null } = {}) {
  return {
    findConsentimentoExistente: vi.fn(async () => opts.existente ?? null),
    insertConsentimento: vi.fn(async () => ({
      id: 555n,
      uuid_externo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })),
  };
}

function makeAuditoria() {
  return { record: vi.fn(async () => undefined) };
}

const baseDto = {
  finalidade: 'TERMO_USO_PORTAL' as const,
  versaoTermo: 'v1.0.0',
  textoApresentado:
    'Termo de uso do portal apresentado ao paciente neste momento (mínimo 20 chars).',
  aceito: true,
};

describe('RegistrarConsentimentoUseCase', () => {
  let resolver: ReturnType<typeof makeResolver>;
  let repo: ReturnType<typeof makeRepo>;
  let auditoria: ReturnType<typeof makeAuditoria>;
  let uc: RegistrarConsentimentoUseCase;

  beforeEach(() => {
    resolver = makeResolver();
    repo = makeRepo();
    auditoria = makeAuditoria();
    uc = new RegistrarConsentimentoUseCase(
      resolver as never,
      repo as never,
      auditoria as never,
    );
  });

  it('insere consentimento novo + emite audit', async () => {
    const out = await uc.execute({
      dto: baseDto,
      ipOrigem: '10.0.0.1',
      userAgent: 'jest',
    });
    expect(out.uuid).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(out.aceito).toBe(true);
    expect(out.ativo).toBe(true);
    expect(repo.insertConsentimento).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7n,
        pacienteId: 99n,
        finalidade: 'TERMO_USO_PORTAL',
        ipOrigem: '10.0.0.1',
        userAgent: 'jest',
      }),
    );
    expect(auditoria.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: 'consentimentos_lgpd',
        operacao: 'I',
        finalidade: 'lgpd.consentimento.registrado',
      }),
    );
  });

  it('rejeita finalidade inválida com 409', async () => {
    await expect(
      uc.execute({
        dto: { ...baseDto, finalidade: 'NAO_EXISTE' as never },
        ipOrigem: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita versaoTermo inválida com 409', async () => {
    await expect(
      uc.execute({
        dto: { ...baseDto, versaoTermo: 'foo' },
        ipOrigem: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONSENTIMENTO_VERSAO_INVALIDA' },
    });
  });

  it('rejeita textoApresentado curto com 409', async () => {
    await expect(
      uc.execute({
        dto: { ...baseDto, textoApresentado: 'curto' },
        ipOrigem: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONSENTIMENTO_TEXTO_INVALIDO' },
    });
  });

  it('rejeita 409 quando já existe (idempotência)', async () => {
    const repoDup = makeRepo({
      existente: {
        id: 1n,
        uuid_externo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    });
    const ucDup = new RegistrarConsentimentoUseCase(
      resolver as never,
      repoDup as never,
      auditoria as never,
    );
    await expect(
      ucDup.execute({ dto: baseDto, ipOrigem: null, userAgent: null }),
    ).rejects.toMatchObject({
      response: {
        code: 'CONSENTIMENTO_JA_REGISTRADO',
        consentimentoUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    });
    expect(repoDup.insertConsentimento).not.toHaveBeenCalled();
  });
});
