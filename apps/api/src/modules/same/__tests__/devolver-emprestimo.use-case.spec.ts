/**
 * Unit do `DevolverEmprestimoUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DevolverEmprestimoUseCase } from '../application/emprestimos/devolver-emprestimo.use-case';

const EMP_UUID = '00000000-0000-4000-8000-0000000000e1';

function buildEmpRow(opts: { status?: string; found?: boolean } = {}) {
  if (opts.found === false) return null;
  return {
    id: 99n,
    uuid_externo: EMP_UUID,
    tenant_id: 1n,
    prontuario_id: 1n,
    solicitante_id: 100n,
    data_emprestimo: new Date('2026-04-01T10:00:00Z'),
    data_devolucao_prevista: new Date('2026-05-01T00:00:00Z'),
    data_devolucao_real:
      opts.status === 'DEVOLVIDO' ? new Date('2026-04-15T10:00:00Z') : null,
    motivo: 'Auditoria',
    status: (opts.status ?? 'ATIVO') as 'ATIVO' | 'ATRASADO' | 'DEVOLVIDO',
    observacao: null,
    created_at: new Date('2026-04-01T10:00:00Z'),
    prontuario_uuid: '00000000-0000-4000-8000-000000000a01',
    numero_pasta: '2026-001',
    paciente_uuid: '00000000-0000-4000-8000-000000000010',
    paciente_nome: 'Paciente Teste',
    solicitante_uuid: '00000000-0000-4000-8000-000000000100',
    solicitante_nome: 'Solicitante',
  };
}

function buildProntuarioRow(opts: { digitalizado?: boolean } = {}) {
  return {
    id: 1n,
    uuid_externo: '00000000-0000-4000-8000-000000000a01',
    tenant_id: 1n,
    paciente_id: 10n,
    numero_pasta: '2026-001',
    localizacao: null,
    status: 'EMPRESTADO' as const,
    digitalizado: opts.digitalizado ?? false,
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

describe('DevolverEmprestimoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('devolve ATIVO → DEVOLVIDO e prontuário volta para ARQUIVADO', async () => {
    const repo = {
      findEmprestimoByUuid: vi
        .fn()
        // 1ª chamada: empréstimo a devolver. 2ª chamada (refresh): já DEVOLVIDO.
        .mockResolvedValueOnce(buildEmpRow({ status: 'ATIVO' }))
        .mockResolvedValueOnce(buildEmpRow({ status: 'DEVOLVIDO' })),
      updateEmprestimoDevolucao: vi.fn().mockResolvedValue(undefined),
      findProntuarioById: vi.fn().mockResolvedValue(buildProntuarioRow()),
      updateProntuarioStatus: vi.fn().mockResolvedValue(undefined),
    };
    const uc = new DevolverEmprestimoUseCase(repo as never, auditoria as never);

    const r = await uc.execute(EMP_UUID, {});

    expect(r.status).toBe('DEVOLVIDO');
    expect(repo.updateEmprestimoDevolucao).toHaveBeenCalledWith({
      id: 99n,
      observacao: null,
    });
    expect(repo.updateProntuarioStatus).toHaveBeenCalledWith({
      id: 1n,
      status: 'ARQUIVADO',
    });
  });

  it('devolve com prontuário digitalizado → volta para DIGITALIZADO', async () => {
    const repo = {
      findEmprestimoByUuid: vi
        .fn()
        .mockResolvedValueOnce(buildEmpRow({ status: 'ATIVO' }))
        .mockResolvedValueOnce(buildEmpRow({ status: 'DEVOLVIDO' })),
      updateEmprestimoDevolucao: vi.fn().mockResolvedValue(undefined),
      findProntuarioById: vi
        .fn()
        .mockResolvedValue(buildProntuarioRow({ digitalizado: true })),
      updateProntuarioStatus: vi.fn().mockResolvedValue(undefined),
    };
    const uc = new DevolverEmprestimoUseCase(repo as never, auditoria as never);
    await uc.execute(EMP_UUID, { observacao: 'tudo certo' });
    expect(repo.updateProntuarioStatus).toHaveBeenCalledWith({
      id: 1n,
      status: 'DIGITALIZADO',
    });
  });

  it('devolve ATRASADO → DEVOLVIDO', async () => {
    const repo = {
      findEmprestimoByUuid: vi
        .fn()
        .mockResolvedValueOnce(buildEmpRow({ status: 'ATRASADO' }))
        .mockResolvedValueOnce(buildEmpRow({ status: 'DEVOLVIDO' })),
      updateEmprestimoDevolucao: vi.fn().mockResolvedValue(undefined),
      findProntuarioById: vi.fn().mockResolvedValue(buildProntuarioRow()),
      updateProntuarioStatus: vi.fn().mockResolvedValue(undefined),
    };
    const uc = new DevolverEmprestimoUseCase(repo as never, auditoria as never);
    const r = await uc.execute(EMP_UUID, {});
    expect(r.status).toBe('DEVOLVIDO');
  });

  it('404 quando empréstimo não encontrado', async () => {
    const repo = {
      findEmprestimoByUuid: vi.fn().mockResolvedValue(null),
      updateEmprestimoDevolucao: vi.fn(),
      findProntuarioById: vi.fn(),
      updateProntuarioStatus: vi.fn(),
    };
    const uc = new DevolverEmprestimoUseCase(repo as never, auditoria as never);
    await expect(uc.execute(EMP_UUID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('422 quando empréstimo já DEVOLVIDO', async () => {
    const repo = {
      findEmprestimoByUuid: vi
        .fn()
        .mockResolvedValue(buildEmpRow({ status: 'DEVOLVIDO' })),
      updateEmprestimoDevolucao: vi.fn(),
      findProntuarioById: vi.fn(),
      updateProntuarioStatus: vi.fn(),
    };
    const uc = new DevolverEmprestimoUseCase(repo as never, auditoria as never);
    await expect(uc.execute(EMP_UUID, {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repo.updateEmprestimoDevolucao).not.toHaveBeenCalled();
  });
});
