/**
 * Unit do `SepararDispensacaoUseCase`.
 *
 * Cobre:
 *   - 404 quando dispensação não existe.
 *   - 409 em estado inválido (DISPENSADA → não pode separar).
 *   - 404 quando item informado não pertence à dispensação.
 *   - Caminho feliz: atualiza lote/validade dos itens citados, status
 *     do cabeçalho vai para SEPARADA, audita e emite evento.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SepararDispensacaoUseCase } from '../application/dispensacoes/separar-dispensacao.use-case';
import { RequestContextStorage } from '../../../common/context/request-context';

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

const DISP_UUID = '99999999-9999-4999-8999-999999999999';
const DISP_BASE = {
  id: 1n,
  data_hora: new Date('2026-04-30T10:00:00Z'),
  uuid_externo: DISP_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  paciente_id: 20n,
  prescricao_id: null,
  prescricao_data_hora: null,
  cirurgia_id: null,
  setor_destino_id: null,
  farmaceutico_id: 40n,
  turno: 'MANHA',
  tipo: 'AVULSA',
  status: 'PENDENTE',
  observacao: null,
  dispensacao_origem_id: null,
  dispensacao_origem_data_hora: null,
  atendimento_uuid: '00000000-0000-4000-8000-000000000010',
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  prescricao_uuid: null,
  cirurgia_uuid: null,
  setor_destino_uuid: null,
  farmaceutico_uuid: '00000000-0000-4000-8000-000000000040',
  dispensacao_origem_uuid: null,
} as const;

const ITEM_BASE = {
  id: 11n,
  uuid_externo: '00000000-0000-4000-8000-000000000099',
  dispensacao_id: 1n,
  dispensacao_data_hora: new Date('2026-04-30T10:00:00Z'),
  procedimento_id: 100n,
  procedimento_uuid: '00000000-0000-4000-8000-000000000100',
  procedimento_nome: 'Dipirona 500mg',
  procedimento_grupo_gasto: 'MEDICAMENTO',
  procedimento_controlado: false,
  procedimento_fator_conversao: '1',
  prescricao_item_id: null,
  prescricao_item_uuid: null,
  quantidade_prescrita: '1',
  quantidade_dispensada: '1',
  unidade_medida: 'CP',
  fator_conversao_aplicado: '1',
  justificativa_divergencia: null,
  lote: null,
  validade: null,
  conta_item_id: null,
  conta_item_uuid: null,
  status: 'PENDENTE' as const,
} as const;

interface RepoMock {
  findDispensacaoByUuid: ReturnType<typeof vi.fn>;
  findItensByDispensacaoId: ReturnType<typeof vi.fn>;
  updateDispensacaoItemSeparacao: ReturnType<typeof vi.fn>;
  updateDispensacaoItemStatus: ReturnType<typeof vi.fn>;
  updateDispensacaoStatus: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findDispensacaoByUuid: vi.fn(),
    findItensByDispensacaoId: vi.fn(),
    updateDispensacaoItemSeparacao: vi.fn(),
    updateDispensacaoItemStatus: vi.fn(),
    updateDispensacaoStatus: vi.fn(),
  };
}

describe('SepararDispensacaoUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: SepararDispensacaoUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new SepararDispensacaoUseCase(
      repo as never,
      auditoria as never,
      events,
    );
  });

  it('404 quando dispensação não existe', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(
        useCase.execute(DISP_UUID, { itens: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('409 quando estado já DISPENSADA', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({
      ...DISP_BASE,
      status: 'DISPENSADA',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(DISP_UUID, { itens: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('404 quando item informado não pertence à dispensação', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({ ...DISP_BASE });
    repo.findItensByDispensacaoId.mockResolvedValueOnce([{ ...ITEM_BASE }]);
    await withCtx(async () => {
      await expect(
        useCase.execute(DISP_UUID, {
          itens: [{ itemUuid: '00000000-0000-4000-8000-000000999999' }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('caminho feliz — atualiza, audita e emite', async () => {
    repo.findDispensacaoByUuid
      .mockResolvedValueOnce({ ...DISP_BASE })
      .mockResolvedValueOnce({ ...DISP_BASE, status: 'SEPARADA' });
    repo.findItensByDispensacaoId
      .mockResolvedValueOnce([{ ...ITEM_BASE }])
      .mockResolvedValueOnce([{ ...ITEM_BASE, status: 'SEPARADA' as const }]);
    const emitted: string[] = [];
    events.on('dispensacao.separada', () => emitted.push('ok'));

    await withCtx(() =>
      useCase.execute(DISP_UUID, {
        itens: [{ itemUuid: ITEM_BASE.uuid_externo, lote: 'NEW123' }],
      }),
    );

    expect(repo.updateDispensacaoItemSeparacao).toHaveBeenCalledWith(
      ITEM_BASE.id,
      'NEW123',
      null,
    );
    expect(repo.updateDispensacaoStatus).toHaveBeenCalledWith(
      DISP_BASE.id,
      DISP_BASE.data_hora,
      'SEPARADA',
    );
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['ok']);
  });
});
