/**
 * Unit do `CreateCasoUseCase`.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { CreateCasoUseCase } from '../application/casos/create-caso.use-case';

const PACIENTE_UUID = '00000000-0000-4000-8000-000000000077';
const ATEND_UUID = '00000000-0000-4000-8000-000000000088';
const SETOR_UUID = '00000000-0000-4000-8000-000000000099';
const LEITO_UUID = '00000000-0000-4000-8000-0000000000aa';

function buildCasoRow(): Record<string, unknown> {
  return {
    id: 1n,
    uuid_externo: 'caso-uuid',
    tenant_id: 1n,
    paciente_id: 77n,
    paciente_uuid: PACIENTE_UUID,
    paciente_nome: 'Paciente Teste',
    atendimento_id: 88n,
    atendimento_uuid: ATEND_UUID,
    setor_id: 99n,
    setor_uuid: SETOR_UUID,
    setor_nome: 'UTI Adulto',
    leito_id: null,
    leito_uuid: null,
    leito_codigo: null,
    data_diagnostico: new Date('2026-05-01T00:00:00Z'),
    topografia: 'Sítio cirúrgico',
    cid: 'T81',
    microorganismo: 'E. coli',
    cultura_origem: 'Sangue',
    resistencia: [{ antibiotico: 'AMOXICILINA', resultado: 'RESISTENTE' }],
    origem_infeccao: 'HOSPITALAR',
    notificacao_compulsoria: false,
    data_notificacao: null,
    resultado: null,
    status: 'ABERTO',
    observacao: null,
    created_at: new Date('2026-05-01T10:00:00Z'),
    updated_at: null,
  };
}

const ctx = {
  tenantId: 1n,
  userId: 42n,
  correlationId: '00000000-0000-4000-8000-000000000abc',
  tx: {} as never,
};

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(RequestContextStorage.run(ctx, fn));
}

describe('CreateCasoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
  });

  it('cria caso (caminho feliz)', async () => {
    const repo = {
      findPacienteIdByUuid: vi.fn(async () => 77n),
      findAtendimentoByUuid: vi.fn(async () => ({
        id: 88n,
        pacienteId: 77n,
        setorId: 99n,
        leitoId: null,
      })),
      findSetorIdByUuid: vi.fn(async () => 99n),
      findLeitoIdByUuid: vi.fn(),
      insertCaso: vi.fn(async () => ({ id: 1n, uuidExterno: 'caso-uuid' })),
      findCasoByUuid: vi.fn(async () => buildCasoRow()),
    };
    const uc = new CreateCasoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );

    await withCtx(async () => {
      const out = await uc.execute({
        pacienteUuid: PACIENTE_UUID,
        atendimentoUuid: ATEND_UUID,
        setorUuid: SETOR_UUID,
        dataDiagnostico: '2026-05-01',
        cid: 'T81',
        microorganismo: 'E. coli',
        culturaOrigem: 'Sangue',
        resistencia: [
          { antibiotico: 'amoxicilina', resultado: 'RESISTENTE' },
        ],
        origemInfeccao: 'HOSPITALAR',
      });
      expect(out.uuid).toBe('caso-uuid');
      // Resistencia foi normalizada para uppercase.
      const insertArgs = repo.insertCaso.mock.calls[0][0] as {
        resistencia: Array<{ antibiotico: string }>;
      };
      expect(insertArgs.resistencia?.[0].antibiotico).toBe('AMOXICILINA');
      expect(events.emit).toHaveBeenCalledWith(
        'ccih.caso_registrado',
        expect.objectContaining({ pacienteUuid: PACIENTE_UUID }),
      );
    });
  });

  it('resolve leitoUuid quando informado', async () => {
    const repo = {
      findPacienteIdByUuid: vi.fn(async () => 77n),
      findAtendimentoByUuid: vi.fn(async () => ({
        id: 88n,
        pacienteId: 77n,
        setorId: 99n,
        leitoId: null,
      })),
      findSetorIdByUuid: vi.fn(async () => 99n),
      findLeitoIdByUuid: vi.fn(async () => 100n),
      insertCaso: vi.fn(async () => ({ id: 1n, uuidExterno: 'caso-uuid' })),
      findCasoByUuid: vi.fn(async () => buildCasoRow()),
    };
    const uc = new CreateCasoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await uc.execute({
        pacienteUuid: PACIENTE_UUID,
        atendimentoUuid: ATEND_UUID,
        setorUuid: SETOR_UUID,
        leitoUuid: LEITO_UUID,
        dataDiagnostico: '2026-05-01',
        origemInfeccao: 'HOSPITALAR',
      });
      const args = repo.insertCaso.mock.calls[0][0] as { leitoId: bigint };
      expect(args.leitoId).toBe(100n);
    });
  });

  it('404 quando paciente não encontrado', async () => {
    const repo = {
      findPacienteIdByUuid: vi.fn(async () => null),
      findAtendimentoByUuid: vi.fn(),
      findSetorIdByUuid: vi.fn(),
      findLeitoIdByUuid: vi.fn(),
      insertCaso: vi.fn(),
      findCasoByUuid: vi.fn(),
    };
    const uc = new CreateCasoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute({
          pacienteUuid: PACIENTE_UUID,
          atendimentoUuid: ATEND_UUID,
          setorUuid: SETOR_UUID,
          dataDiagnostico: '2026-05-01',
          origemInfeccao: 'HOSPITALAR',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('422 quando atendimento não pertence ao paciente', async () => {
    const repo = {
      findPacienteIdByUuid: vi.fn(async () => 77n),
      findAtendimentoByUuid: vi.fn(async () => ({
        id: 88n,
        pacienteId: 999n, // outro paciente
        setorId: 99n,
        leitoId: null,
      })),
      findSetorIdByUuid: vi.fn(),
      findLeitoIdByUuid: vi.fn(),
      insertCaso: vi.fn(),
      findCasoByUuid: vi.fn(),
    };
    const uc = new CreateCasoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute({
          pacienteUuid: PACIENTE_UUID,
          atendimentoUuid: ATEND_UUID,
          setorUuid: SETOR_UUID,
          dataDiagnostico: '2026-05-01',
          origemInfeccao: 'HOSPITALAR',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('404 quando setor não encontrado', async () => {
    const repo = {
      findPacienteIdByUuid: vi.fn(async () => 77n),
      findAtendimentoByUuid: vi.fn(async () => ({
        id: 88n,
        pacienteId: 77n,
        setorId: 99n,
        leitoId: null,
      })),
      findSetorIdByUuid: vi.fn(async () => null),
      findLeitoIdByUuid: vi.fn(),
      insertCaso: vi.fn(),
      findCasoByUuid: vi.fn(),
    };
    const uc = new CreateCasoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute({
          pacienteUuid: PACIENTE_UUID,
          atendimentoUuid: ATEND_UUID,
          setorUuid: SETOR_UUID,
          dataDiagnostico: '2026-05-01',
          origemInfeccao: 'HOSPITALAR',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
