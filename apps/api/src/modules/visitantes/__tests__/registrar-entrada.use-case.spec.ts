/**
 * Unit do `RegistrarEntradaUseCase` — cobre RN-VIS-01..04.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { RegistrarEntradaUseCase } from '../application/visitas/registrar-entrada.use-case';

const VISITANTE_UUID = '00000000-0000-4000-8000-000000000a01';
const PACIENTE_UUID = '00000000-0000-4000-8000-000000000010';
const VISITA_UUID = '00000000-0000-4000-8000-0000000000f1';

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

function buildVisitanteRow(opts: {
  bloqueado?: boolean;
  motivo?: string | null;
} = {}) {
  return {
    id: 1n,
    uuid_externo: VISITANTE_UUID,
    tenant_id: 1n,
    nome: 'João',
    cpf_hash: 'a'.repeat(64),
    cpf_ultimos4: '8901',
    documento_foto_url: null,
    bloqueado: opts.bloqueado ?? false,
    motivo_bloqueio: opts.motivo ?? null,
    bloqueado_em: null,
    bloqueado_por: null,
    observacao: null,
    created_at: new Date('2026-05-01T00:00:00Z'),
    updated_at: null,
    bloqueado_por_uuid: null,
  };
}

function buildAtendimento(opts: {
  setorTipo?: string;
  leitoTipoAcomodacao?: string | null;
  leitoId?: bigint | null;
} = {}) {
  return {
    atendimentoId: 50n,
    pacienteId: 10n,
    leitoId: opts.leitoId === undefined ? 200n : opts.leitoId,
    setorId: 30n,
    setorTipo: opts.setorTipo ?? 'INTERNACAO',
    leitoTipoAcomodacao:
      opts.leitoTipoAcomodacao === undefined
        ? 'ENFERMARIA'
        : opts.leitoTipoAcomodacao,
    status: 'INTERNADO',
  };
}

function buildVisitaRow() {
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
    data_saida: null,
    porteiro_id: 100n,
    observacao: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    visitante_uuid: VISITANTE_UUID,
    visitante_nome: 'João',
    paciente_uuid: PACIENTE_UUID,
    paciente_nome: 'Maria',
    leito_uuid: '00000000-0000-4000-8000-000000000200',
    leito_codigo: '201A',
    setor_uuid: '00000000-0000-4000-8000-000000000030',
    setor_nome: 'Internação 2A',
    porteiro_uuid: '00000000-0000-4000-8000-000000000100',
  };
}

function buildRepo(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    findVisitanteByUuid: vi
      .fn()
      .mockResolvedValue(buildVisitanteRow()),
    findAtendimentoAtivoDoPaciente: vi
      .fn()
      .mockResolvedValue(buildAtendimento()),
    countVisitasAtivasNoLeito: vi.fn().mockResolvedValue(0),
    insertVisita: vi.fn().mockResolvedValue({
      id: 99n,
      uuidExterno: VISITA_UUID,
    }),
    findVisitaByUuid: vi.fn().mockResolvedValue(buildVisitaRow()),
    ...overrides,
  };
}

describe('RegistrarEntradaUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
  });

  it('caminho feliz: ENFERMARIA com 0 visitas → registra e audita', async () => {
    const repo = buildRepo();
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        visitanteUuid: VISITANTE_UUID,
        pacienteUuid: PACIENTE_UUID,
      }),
    );
    expect(r.uuid).toBe(VISITA_UUID);
    expect(repo.insertVisita).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
  });

  it('404 quando visitante não existe', async () => {
    const repo = buildRepo({
      findVisitanteByUuid: vi.fn().mockResolvedValue(null),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RN-VIS-03: 422 quando visitante bloqueado', async () => {
    const repo = buildRepo({
      findVisitanteByUuid: vi.fn().mockResolvedValue(
        buildVisitanteRow({ bloqueado: true, motivo: 'tumulto' }),
      ),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.insertVisita).not.toHaveBeenCalled();
  });

  it('RN-VIS-01: 422 quando paciente sem atendimento ativo', async () => {
    const repo = buildRepo({
      findAtendimentoAtivoDoPaciente: vi.fn().mockResolvedValue(null),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.insertVisita).not.toHaveBeenCalled();
  });

  it('RN-VIS-04: 422 quando setor é UTI', async () => {
    const repo = buildRepo({
      findAtendimentoAtivoDoPaciente: vi.fn().mockResolvedValue(
        buildAtendimento({ setorTipo: 'UTI', leitoTipoAcomodacao: 'UTI' }),
      ),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toThrowError(/UTI/i);
    expect(repo.insertVisita).not.toHaveBeenCalled();
  });

  it('RN-VIS-02: 422 quando ENFERMARIA com 2 visitas ativas', async () => {
    const repo = buildRepo({
      countVisitasAtivasNoLeito: vi.fn().mockResolvedValue(2),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('RN-VIS-02: APARTAMENTO com 4 → bloqueia', async () => {
    const repo = buildRepo({
      findAtendimentoAtivoDoPaciente: vi.fn().mockResolvedValue(
        buildAtendimento({ leitoTipoAcomodacao: 'APARTAMENTO' }),
      ),
      countVisitasAtivasNoLeito: vi.fn().mockResolvedValue(4),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    await expect(
      withCtx(() =>
        uc.execute({
          visitanteUuid: VISITANTE_UUID,
          pacienteUuid: PACIENTE_UUID,
        }),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('RN-VIS-02: APARTAMENTO com 3 → permite', async () => {
    const repo = buildRepo({
      findAtendimentoAtivoDoPaciente: vi.fn().mockResolvedValue(
        buildAtendimento({ leitoTipoAcomodacao: 'APARTAMENTO' }),
      ),
      countVisitasAtivasNoLeito: vi.fn().mockResolvedValue(3),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        visitanteUuid: VISITANTE_UUID,
        pacienteUuid: PACIENTE_UUID,
      }),
    );
    expect(r.uuid).toBe(VISITA_UUID);
  });

  it('atendimento sem leito atribuído: pula validação RN-VIS-02', async () => {
    const repo = buildRepo({
      findAtendimentoAtivoDoPaciente: vi.fn().mockResolvedValue(
        buildAtendimento({ leitoId: null, leitoTipoAcomodacao: null }),
      ),
    });
    const uc = new RegistrarEntradaUseCase(repo as never, auditoria as never);
    const r = await withCtx(() =>
      uc.execute({
        visitanteUuid: VISITANTE_UUID,
        pacienteUuid: PACIENTE_UUID,
      }),
    );
    expect(r.uuid).toBe(VISITA_UUID);
    expect(repo.countVisitasAtivasNoLeito).not.toHaveBeenCalled();
  });
});
