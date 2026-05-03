/**
 * Unit do `RegistrarSaidaUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistrarSaidaUseCase } from '../application/visitas/registrar-saida.use-case';

const VISITA_UUID = '00000000-0000-4000-8000-0000000000f1';

function buildVisitaRow(opts: { saida?: boolean } = {}) {
  return {
    id: 99n,
    uuid_externo: VISITA_UUID,
    tenant_id: 1n,
    visitante_id: 1n,
    paciente_id: 10n,
    atendimento_id: 50n,
    leito_id: 200n,
    setor_id: 30n,
    data_entrada: new Date('2026-05-01T10:00:00Z'),
    data_saida: opts.saida ? new Date('2026-05-01T11:00:00Z') : null,
    porteiro_id: 100n,
    observacao: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    visitante_uuid: '00000000-0000-4000-8000-000000000a01',
    visitante_nome: 'João',
    paciente_uuid: '00000000-0000-4000-8000-000000000010',
    paciente_nome: 'Maria',
    leito_uuid: '00000000-0000-4000-8000-000000000200',
    leito_codigo: '201A',
    setor_uuid: '00000000-0000-4000-8000-000000000030',
    setor_nome: 'Internação 2A',
    porteiro_uuid: '00000000-0000-4000-8000-000000000100',
  };
}

describe('RegistrarSaidaUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('registra saída em visita ativa', async () => {
    const repo = {
      findVisitaByUuid: vi
        .fn()
        .mockResolvedValueOnce(buildVisitaRow())
        .mockResolvedValueOnce(buildVisitaRow({ saida: true })),
      updateVisitaSaida: vi.fn().mockResolvedValue(undefined),
    };
    const uc = new RegistrarSaidaUseCase(repo as never, auditoria as never);
    const r = await uc.execute(VISITA_UUID);
    expect(r.dataSaida).not.toBeNull();
    expect(r.ativa).toBe(false);
    expect(repo.updateVisitaSaida).toHaveBeenCalledWith({ id: 99n });
    expect(auditoria.record).toHaveBeenCalledOnce();
  });

  it('404 quando visita não existe', async () => {
    const repo = {
      findVisitaByUuid: vi.fn().mockResolvedValue(null),
      updateVisitaSaida: vi.fn(),
    };
    const uc = new RegistrarSaidaUseCase(repo as never, auditoria as never);
    await expect(uc.execute(VISITA_UUID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('422 quando visita já tem saída', async () => {
    const repo = {
      findVisitaByUuid: vi
        .fn()
        .mockResolvedValue(buildVisitaRow({ saida: true })),
      updateVisitaSaida: vi.fn(),
    };
    const uc = new RegistrarSaidaUseCase(repo as never, auditoria as never);
    await expect(uc.execute(VISITA_UUID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repo.updateVisitaSaida).not.toHaveBeenCalled();
  });
});
