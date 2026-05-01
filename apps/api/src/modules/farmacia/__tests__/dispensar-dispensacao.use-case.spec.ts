/**
 * Unit do `DispensarDispensacaoUseCase`.
 *
 * Cobre:
 *   - 404 quando dispensação não existe.
 *   - 409 em estado inválido (DISPENSADA → não pode dispensar de novo).
 *   - 422 quando atendimento não tem conta aberta.
 *   - 422 quando item controlado sem lote.
 *   - 422 quando saldo de controlado ficaria negativo.
 *   - Caminho feliz: gera contas_itens + livro_controlados + audita +
 *     emite evento.
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispensarDispensacaoUseCase } from '../application/dispensacoes/dispensar-dispensacao.use-case';
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
const ATEND_UUID = '00000000-0000-4000-8000-000000000001';

const DISP_BASE = {
  id: 1n,
  data_hora: new Date('2026-04-30T10:00:00Z'),
  uuid_externo: DISP_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  paciente_id: 20n,
  prescricao_id: 30n,
  prescricao_data_hora: new Date('2026-04-30T08:00:00Z'),
  cirurgia_id: null,
  setor_destino_id: null,
  farmaceutico_id: 40n,
  turno: 'MANHA',
  tipo: 'PRESCRICAO',
  status: 'SEPARADA',
  observacao: null,
  dispensacao_origem_id: null,
  dispensacao_origem_data_hora: null,
  atendimento_uuid: ATEND_UUID,
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  prescricao_uuid: '00000000-0000-4000-8000-000000000030',
  cirurgia_uuid: null,
  setor_destino_uuid: null,
  farmaceutico_uuid: '00000000-0000-4000-8000-000000000040',
  dispensacao_origem_uuid: null,
} as const;

const ITEM_NORMAL = {
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
  lote: 'LT001',
  validade: new Date('2026-12-31T00:00:00Z'),
  conta_item_id: null,
  conta_item_uuid: null,
  status: 'SEPARADA' as const,
} as const;

const ITEM_CONTROLADO = {
  ...ITEM_NORMAL,
  id: 12n,
  uuid_externo: '00000000-0000-4000-8000-000000000098',
  procedimento_id: 200n,
  procedimento_uuid: '00000000-0000-4000-8000-000000000200',
  procedimento_nome: 'Morfina 10mg',
  procedimento_grupo_gasto: 'MEDICAMENTO',
  procedimento_controlado: true,
  lote: 'MOR001',
} as const;

interface RepoMock {
  findDispensacaoByUuid: ReturnType<typeof vi.fn>;
  findItensByDispensacaoId: ReturnType<typeof vi.fn>;
  findAtendimentoContaId: ReturnType<typeof vi.fn>;
  findAtendimentoBasics: ReturnType<typeof vi.fn>;
  findSaldoAtual: ReturnType<typeof vi.fn>;
  insertMovimentoControlado: ReturnType<typeof vi.fn>;
  insertContaItem: ReturnType<typeof vi.fn>;
  setDispensacaoItemContaId: ReturnType<typeof vi.fn>;
  updateDispensacaoStatus: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findDispensacaoByUuid: vi.fn(),
    findItensByDispensacaoId: vi.fn(),
    findAtendimentoContaId: vi.fn(),
    findAtendimentoBasics: vi.fn(),
    findSaldoAtual: vi.fn(),
    insertMovimentoControlado: vi.fn(),
    insertContaItem: vi.fn(),
    setDispensacaoItemContaId: vi.fn(),
    updateDispensacaoStatus: vi.fn(),
  };
}

describe('DispensarDispensacaoUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: DispensarDispensacaoUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new DispensarDispensacaoUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.findAtendimentoContaId.mockResolvedValue(50n);
    repo.findAtendimentoBasics.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      setorId: 60n,
    });
    repo.insertContaItem.mockResolvedValue({
      id: 500n,
      uuidExterno: '00000000-0000-4000-8000-000000000500',
    });
    repo.findDispensacaoByUuid.mockResolvedValue({
      ...DISP_BASE,
      status: 'DISPENSADA',
    });
  });

  it('404 quando dispensação não existe', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(useCase.execute(DISP_UUID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('409 em estado inválido (DISPENSADA → não pode dispensar de novo)', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({
      ...DISP_BASE,
      status: 'DISPENSADA',
    });
    await withCtx(async () => {
      await expect(useCase.execute(DISP_UUID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it('422 quando atendimento sem conta aberta', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({ ...DISP_BASE });
    repo.findItensByDispensacaoId.mockResolvedValueOnce([{ ...ITEM_NORMAL }]);
    repo.findAtendimentoContaId.mockResolvedValueOnce(null);
    await withCtx(async () => {
      await expect(useCase.execute(DISP_UUID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('422 quando item controlado sem lote', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({ ...DISP_BASE });
    repo.findItensByDispensacaoId.mockResolvedValueOnce([
      { ...ITEM_CONTROLADO, lote: null },
    ]);
    await withCtx(async () => {
      await expect(useCase.execute(DISP_UUID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('422 quando saldo de controlado ficaria negativo', async () => {
    repo.findDispensacaoByUuid.mockResolvedValueOnce({ ...DISP_BASE });
    repo.findItensByDispensacaoId.mockResolvedValueOnce([{ ...ITEM_CONTROLADO }]);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '0' });
    await withCtx(async () => {
      await expect(useCase.execute(DISP_UUID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('caminho feliz — gera contas_itens + livro + audita + emite', async () => {
    repo.findDispensacaoByUuid
      .mockResolvedValueOnce({ ...DISP_BASE })
      .mockResolvedValueOnce({ ...DISP_BASE, status: 'DISPENSADA' });
    repo.findItensByDispensacaoId
      .mockResolvedValueOnce([{ ...ITEM_NORMAL }, { ...ITEM_CONTROLADO }])
      // segunda chamada após o update.
      .mockResolvedValueOnce([
        { ...ITEM_NORMAL, status: 'DISPENSADA' as const },
        { ...ITEM_CONTROLADO, status: 'DISPENSADA' as const },
      ]);
    repo.findSaldoAtual.mockResolvedValue({ saldoAtual: '100' });
    const emitted: string[] = [];
    events.on('dispensacao.dispensada', () => emitted.push('ok'));

    await withCtx(() => useCase.execute(DISP_UUID));

    expect(repo.insertMovimentoControlado).toHaveBeenCalledOnce();
    expect(repo.insertContaItem).toHaveBeenCalledTimes(2);
    expect(repo.setDispensacaoItemContaId).toHaveBeenCalledTimes(2);
    expect(repo.updateDispensacaoStatus).toHaveBeenCalledWith(
      1n,
      DISP_BASE.data_hora,
      'DISPENSADA',
    );
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['ok']);
  });
});
