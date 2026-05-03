/**
 * Unit do `CreateEmprestimoUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { CreateEmprestimoUseCase } from '../application/emprestimos/create-emprestimo.use-case';

const PRONTUARIO_UUID = '00000000-0000-4000-8000-000000000a01';

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

function buildRow(opts: { status?: string; found?: boolean }) {
  if (opts.found === false) return null;
  return {
    id: 1n,
    uuid_externo: PRONTUARIO_UUID,
    tenant_id: 1n,
    paciente_id: 10n,
    numero_pasta: '2026-001',
    localizacao: null,
    status: opts.status ?? 'ARQUIVADO',
    digitalizado: false,
    pdf_legado_url: null,
    data_digitalizacao: null,
    digitalizado_por: null,
    observacao: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    created_by: null,
    updated_at: null,
    paciente_uuid: '00000000-0000-4000-8000-000000000010',
    paciente_nome: 'Paciente Teste',
    digitalizado_por_uuid: null,
  };
}

function buildEmprestimoRow() {
  return {
    id: 99n,
    uuid_externo: '00000000-0000-4000-8000-0000000000e1',
    tenant_id: 1n,
    prontuario_id: 1n,
    solicitante_id: 100n,
    data_emprestimo: new Date('2026-05-01T10:00:00Z'),
    data_devolucao_prevista: new Date('2026-05-31T00:00:00Z'),
    data_devolucao_real: null,
    motivo: 'Auditoria interna',
    status: 'ATIVO' as const,
    observacao: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    prontuario_uuid: PRONTUARIO_UUID,
    numero_pasta: '2026-001',
    paciente_uuid: '00000000-0000-4000-8000-000000000010',
    paciente_nome: 'Paciente Teste',
    solicitante_uuid: '00000000-0000-4000-8000-000000000100',
    solicitante_nome: 'Solicitante',
  };
}

describe('CreateEmprestimoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('cria empréstimo a partir de ARQUIVADO e atualiza status do prontuário', async () => {
    const repo = {
      findProntuarioByUuid: vi.fn().mockResolvedValue(buildRow({})),
      insertEmprestimo: vi
        .fn()
        .mockResolvedValue({ id: 99n, uuidExterno: 'uuid-emp' }),
      updateProntuarioStatus: vi.fn().mockResolvedValue(undefined),
      findEmprestimoByUuid: vi.fn().mockResolvedValue(buildEmprestimoRow()),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);

    const r = await withCtx(() =>
      uc.execute({
        prontuarioUuid: PRONTUARIO_UUID,
        motivo: 'Auditoria interna',
      }),
    );

    expect(r.status).toBe('ATIVO');
    expect(repo.insertEmprestimo).toHaveBeenCalledOnce();
    expect(repo.updateProntuarioStatus).toHaveBeenCalledWith({
      id: 1n,
      status: 'EMPRESTADO',
    });
    expect(auditoria.record).toHaveBeenCalledOnce();
  });

  it('cria a partir de DIGITALIZADO', async () => {
    const repo = {
      findProntuarioByUuid: vi
        .fn()
        .mockResolvedValue(buildRow({ status: 'DIGITALIZADO' })),
      insertEmprestimo: vi
        .fn()
        .mockResolvedValue({ id: 99n, uuidExterno: 'uuid-emp' }),
      updateProntuarioStatus: vi.fn().mockResolvedValue(undefined),
      findEmprestimoByUuid: vi.fn().mockResolvedValue(buildEmprestimoRow()),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        prontuarioUuid: PRONTUARIO_UUID,
        motivo: 'Levar p/ ambulatório',
      }),
    );
    expect(r.status).toBe('ATIVO');
  });

  it('404 quando prontuário não encontrado', async () => {
    const repo = {
      findProntuarioByUuid: vi.fn().mockResolvedValue(null),
      insertEmprestimo: vi.fn(),
      updateProntuarioStatus: vi.fn(),
      findEmprestimoByUuid: vi.fn(),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({ prontuarioUuid: PRONTUARIO_UUID, motivo: 'x' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 quando prontuário EMPRESTADO', async () => {
    const repo = {
      findProntuarioByUuid: vi
        .fn()
        .mockResolvedValue(buildRow({ status: 'EMPRESTADO' })),
      insertEmprestimo: vi.fn(),
      updateProntuarioStatus: vi.fn(),
      findEmprestimoByUuid: vi.fn(),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          prontuarioUuid: PRONTUARIO_UUID,
          motivo: 'pegar de novo',
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.insertEmprestimo).not.toHaveBeenCalled();
  });

  it('422 quando prontuário DESCARTADO', async () => {
    const repo = {
      findProntuarioByUuid: vi
        .fn()
        .mockResolvedValue(buildRow({ status: 'DESCARTADO' })),
      insertEmprestimo: vi.fn(),
      updateProntuarioStatus: vi.fn(),
      findEmprestimoByUuid: vi.fn(),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({ prontuarioUuid: PRONTUARIO_UUID, motivo: 'x' }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('422 quando data_devolucao_prevista passada', async () => {
    const repo = {
      findProntuarioByUuid: vi.fn().mockResolvedValue(buildRow({})),
      insertEmprestimo: vi.fn(),
      updateProntuarioStatus: vi.fn(),
      findEmprestimoByUuid: vi.fn(),
    };
    const uc = new CreateEmprestimoUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          prontuarioUuid: PRONTUARIO_UUID,
          motivo: 'Auditoria',
          dataDevolucaoPrevista: '2020-01-01',
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
