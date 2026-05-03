/**
 * Unit do `MovimentarArtigoUseCase` — RN-CME-02 / RN-CME-05.
 */
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStorage } from '../../../common/context/request-context';
import { MovimentarArtigoUseCase } from '../application/artigos/movimentar-artigo.use-case';

const ARTIGO_UUID = '00000000-0000-4000-8000-000000000030';
const PRESTADOR_UUID = '00000000-0000-4000-8000-000000000099';
const PACIENTE_UUID = '00000000-0000-4000-8000-000000000077';
const CIRURGIA_UUID = '00000000-0000-4000-8000-000000000088';

function buildArtigoRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 50n,
    uuid_externo: ARTIGO_UUID,
    tenant_id: 1n,
    lote_id: 5n,
    lote_uuid: '00000000-0000-4000-8000-000000000020',
    lote_numero: 'LOTE-005',
    lote_status: 'LIBERADO',
    codigo_artigo: 'PINCA-001',
    descricao: 'Pinça anatômica',
    etapa_atual: 'DISTRIBUICAO',
    cirurgia_id: null,
    cirurgia_uuid: null,
    paciente_id: null,
    paciente_uuid: null,
    ultima_movimentacao: new Date('2026-05-01T10:00:00Z'),
    created_at: new Date('2026-05-01T10:00:00Z'),
    updated_at: null,
    ...overrides,
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

describe('MovimentarArtigoUseCase', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
  });

  it('movimenta DISTRIBUICAO → EM_USO grava paciente/cirurgia (RN-CME-05)', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () => buildArtigoRow()),
      findPrestadorIdByUuid: vi.fn(async () => 99n),
      findPacienteIdByUuid: vi.fn(async () => 77n),
      findCirurgiaIdByUuid: vi.fn(async () => 88n),
      insertMovimentacao: vi.fn(async () => ({
        id: 200n,
        uuidExterno: 'mov-uuid',
      })),
      updateArtigoUso: vi.fn(async () => undefined),
      clearArtigoUso: vi.fn(async () => undefined),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );

    await withCtx(async () => {
      await uc.execute(ARTIGO_UUID, {
        etapaDestino: 'EM_USO',
        responsavelUuid: PRESTADOR_UUID,
        pacienteUuid: PACIENTE_UUID,
        cirurgiaUuid: CIRURGIA_UUID,
      });
      expect(repo.insertMovimentacao).toHaveBeenCalledWith(
        expect.objectContaining({
          etapaOrigem: 'DISTRIBUICAO',
          etapaDestino: 'EM_USO',
          responsavelId: 99n,
        }),
      );
      expect(repo.updateArtigoUso).toHaveBeenCalledWith({
        id: 50n,
        pacienteId: 77n,
        cirurgiaId: 88n,
      });
      expect(events.emit).toHaveBeenCalledWith(
        'cme.artigo_movimentado',
        expect.objectContaining({
          etapaOrigem: 'DISTRIBUICAO',
          etapaDestino: 'EM_USO',
        }),
      );
    });
  });

  it('movimenta EM_USO → RECEPCAO limpa paciente/cirurgia', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () =>
        buildArtigoRow({
          etapa_atual: 'EM_USO',
          paciente_id: 77n,
          cirurgia_id: 88n,
          paciente_uuid: PACIENTE_UUID,
          cirurgia_uuid: CIRURGIA_UUID,
        }),
      ),
      findPrestadorIdByUuid: vi.fn(async () => 99n),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(async () => ({
        id: 200n,
        uuidExterno: 'mov-uuid',
      })),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(async () => undefined),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );

    await withCtx(async () => {
      await uc.execute(ARTIGO_UUID, {
        etapaDestino: 'RECEPCAO',
        responsavelUuid: PRESTADOR_UUID,
      });
      expect(repo.clearArtigoUso).toHaveBeenCalledWith(50n);
      expect(repo.updateArtigoUso).not.toHaveBeenCalled();
    });
  });

  it('422 quando ESTERILIZACAO → GUARDA com lote != LIBERADO (RN-CME-02)', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () =>
        buildArtigoRow({
          etapa_atual: 'ESTERILIZACAO',
          lote_status: 'EM_PROCESSAMENTO',
        }),
      ),
      findPrestadorIdByUuid: vi.fn(async () => 99n),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(ARTIGO_UUID, {
          etapaDestino: 'GUARDA',
          responsavelUuid: PRESTADOR_UUID,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.insertMovimentacao).not.toHaveBeenCalled();
    });
  });

  it('422 quando transição é inválida (RECEPCAO → ESTERILIZACAO)', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () =>
        buildArtigoRow({ etapa_atual: 'RECEPCAO' }),
      ),
      findPrestadorIdByUuid: vi.fn(async () => 99n),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(ARTIGO_UUID, {
          etapaDestino: 'ESTERILIZACAO',
          responsavelUuid: PRESTADOR_UUID,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando EM_USO sem paciente (RN-CME-05)', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () =>
        buildArtigoRow({ etapa_atual: 'DISTRIBUICAO' }),
      ),
      findPrestadorIdByUuid: vi.fn(async () => 99n),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(ARTIGO_UUID, {
          etapaDestino: 'EM_USO',
          responsavelUuid: PRESTADOR_UUID,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('404 quando artigo não encontrado', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () => null),
      findPrestadorIdByUuid: vi.fn(),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(ARTIGO_UUID, {
          etapaDestino: 'LIMPEZA',
          responsavelUuid: PRESTADOR_UUID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('404 quando responsável não encontrado', async () => {
    const repo = {
      findArtigoByUuid: vi.fn(async () =>
        buildArtigoRow({ etapa_atual: 'RECEPCAO' }),
      ),
      findPrestadorIdByUuid: vi.fn(async () => null),
      findPacienteIdByUuid: vi.fn(),
      findCirurgiaIdByUuid: vi.fn(),
      insertMovimentacao: vi.fn(),
      updateArtigoUso: vi.fn(),
      clearArtigoUso: vi.fn(),
    };
    const uc = new MovimentarArtigoUseCase(
      repo as never,
      auditoria as never,
      events as never,
    );
    await withCtx(async () => {
      await expect(
        uc.execute(ARTIGO_UUID, {
          etapaDestino: 'LIMPEZA',
          responsavelUuid: PRESTADOR_UUID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
