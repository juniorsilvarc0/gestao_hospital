/**
 * Unit do `CreateTenantUseCase`.
 *
 * Cobre:
 *   - Idempotência por código (duplicado → 409).
 *   - Idempotência por CNPJ (duplicado → 409).
 *   - Sucesso: chama `insertTenantWithDefaultProfiles`, audit, presenter.
 *   - Sucesso: o repo cria perfis padrão (responsabilidade do repo,
 *     verificada via inspeção da assinatura/contrato — o teste real
 *     fica nos testes de integração).
 */
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { CreateTenantUseCase } from '../application/tenants/create-tenant.use-case';

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(
    RequestContextStorage.run(
      {
        tenantId: 1n,
        userId: 100n,
        correlationId: '11111111-1111-4111-8111-111111111111',
        tx: {} as never,
      },
      fn,
    ),
  );
}

const TENANT_UUID = '00000000-0000-4000-8000-000000000aaa';

function buildRow() {
  return {
    id: 7n,
    uuid_externo: TENANT_UUID,
    codigo: 'HOSPDEMO',
    cnpj: '00000000000000',
    razao_social: 'Hospital Demo S/A',
    nome_fantasia: 'Demo',
    cnes: null,
    registro_ans: null,
    versao_tiss_padrao: '4.01.00',
    ativo: true,
    created_at: new Date('2026-05-04T12:00:00Z'),
    updated_at: null,
    deleted_at: null,
  };
}

function baseDto() {
  return {
    codigo: 'hospdemo',
    cnpj: '00000000000000',
    razaoSocial: 'Hospital Demo S/A',
    nomeFantasia: 'Demo',
  };
}

describe('CreateTenantUseCase', () => {
  const repo = {
    findTenantByCodigo: vi.fn(),
    findTenantByCnpj: vi.fn(),
    insertTenantWithDefaultProfiles: vi.fn(),
  };
  const auditoria = { record: vi.fn() };
  const useCase = new CreateTenantUseCase(repo as never, auditoria as never);

  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockReset());
    auditoria.record.mockReset();
  });

  it('rejeita código duplicado com 409', async () => {
    repo.findTenantByCodigo.mockResolvedValue(buildRow());
    await expect(withCtx(() => useCase.execute(baseDto()))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.insertTenantWithDefaultProfiles).not.toHaveBeenCalled();
  });

  it('rejeita CNPJ duplicado com 409', async () => {
    repo.findTenantByCodigo.mockResolvedValue(null);
    repo.findTenantByCnpj.mockResolvedValue(buildRow());
    await expect(withCtx(() => useCase.execute(baseDto()))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.insertTenantWithDefaultProfiles).not.toHaveBeenCalled();
  });

  it('cria tenant + perfis padrão e registra auditoria', async () => {
    repo.findTenantByCodigo.mockResolvedValue(null);
    repo.findTenantByCnpj.mockResolvedValue(null);
    repo.insertTenantWithDefaultProfiles.mockResolvedValue(buildRow());

    const result = await withCtx(() => useCase.execute(baseDto()));

    expect(result.uuid).toBe(TENANT_UUID);
    expect(result.codigo).toBe('HOSPDEMO');
    expect(result.razaoSocial).toBe('Hospital Demo S/A');
    expect(result.versaoTissPadrao).toBe('4.01.00');
    expect(repo.insertTenantWithDefaultProfiles).toHaveBeenCalledOnce();
    const args = repo.insertTenantWithDefaultProfiles.mock.calls[0][0];
    // codigo é forçado a uppercase
    expect(args.codigo).toBe('HOSPDEMO');
    expect(args.cnpj).toBe('00000000000000');
    expect(args.versaoTissPadrao).toBe('4.01.00');
    expect(args.ativo).toBe(true);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(auditoria.record.mock.calls[0][0].tabela).toBe('tenants');
    expect(auditoria.record.mock.calls[0][0].operacao).toBe('I');
    expect(auditoria.record.mock.calls[0][0].finalidade).toBe(
      'admin.tenant.created',
    );
  });

  it('respeita versaoTissPadrao customizada quando fornecida', async () => {
    repo.findTenantByCodigo.mockResolvedValue(null);
    repo.findTenantByCnpj.mockResolvedValue(null);
    repo.insertTenantWithDefaultProfiles.mockResolvedValue(buildRow());

    await withCtx(() =>
      useCase.execute({ ...baseDto(), versaoTissPadrao: '3.05.00' }),
    );
    const args = repo.insertTenantWithDefaultProfiles.mock.calls[0][0];
    expect(args.versaoTissPadrao).toBe('3.05.00');
  });

  it('passa ativo=false quando o DTO informar', async () => {
    repo.findTenantByCodigo.mockResolvedValue(null);
    repo.findTenantByCnpj.mockResolvedValue(null);
    repo.insertTenantWithDefaultProfiles.mockResolvedValue(buildRow());

    await withCtx(() => useCase.execute({ ...baseDto(), ativo: false }));
    const args = repo.insertTenantWithDefaultProfiles.mock.calls[0][0];
    expect(args.ativo).toBe(false);
  });
});
