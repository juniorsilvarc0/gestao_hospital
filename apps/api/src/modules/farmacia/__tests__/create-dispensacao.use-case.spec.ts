/**
 * Unit do `CreateDispensacaoUseCase`.
 *
 * Cobre:
 *   - RN-FAR-01: prescrição em status diferente de ATIVA → 422.
 *   - RN-FAR-01: AVULSA sem motivo → 400.
 *   - RN-FAR-01: AVULSA sem permissão → 403.
 *   - RN-FAR-03: divergência prescrita×dispensada sem justificativa → 422.
 *   - RN-FAR-06: KIT_CIRURGICO sem itens nem kit associado → 400.
 *   - Caminho feliz PRESCRICAO: insert + audita + emite evento.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateDispensacaoUseCase } from '../application/dispensacoes/create-dispensacao.use-case';
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

const ATEND_UUID = '00000000-0000-4000-8000-000000000001';
const PROC_UUID = '00000000-0000-4000-8000-000000000002';
const PRESC_UUID = '00000000-0000-4000-8000-000000000003';
const CIRURGIA_UUID = '00000000-0000-4000-8000-000000000004';

interface RepoMock {
  findAtendimentoBasics: ReturnType<typeof vi.fn>;
  findPrestadorIdByUserId: ReturnType<typeof vi.fn>;
  findSetorIdByUuid: ReturnType<typeof vi.fn>;
  findPrescricaoMin: ReturnType<typeof vi.fn>;
  findCirurgiaMin: ReturnType<typeof vi.fn>;
  findKitItens: ReturnType<typeof vi.fn>;
  findProcedimentosByUuids: ReturnType<typeof vi.fn>;
  findProcedimentosByIds: ReturnType<typeof vi.fn>;
  findPrescricaoItemIds: ReturnType<typeof vi.fn>;
  insertDispensacao: ReturnType<typeof vi.fn>;
  insertDispensacaoItem: ReturnType<typeof vi.fn>;
  findDispensacaoByUuid: ReturnType<typeof vi.fn>;
  findItensByDispensacaoId: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findAtendimentoBasics: vi.fn(),
    findPrestadorIdByUserId: vi.fn(),
    findSetorIdByUuid: vi.fn(),
    findPrescricaoMin: vi.fn(),
    findCirurgiaMin: vi.fn(),
    findKitItens: vi.fn(),
    findProcedimentosByUuids: vi.fn(),
    findProcedimentosByIds: vi.fn(),
    findPrescricaoItemIds: vi.fn(),
    insertDispensacao: vi.fn(),
    insertDispensacaoItem: vi.fn(),
    findDispensacaoByUuid: vi.fn(),
    findItensByDispensacaoId: vi.fn(),
  };
}

const DISP_ROW = {
  id: 1n,
  data_hora: new Date('2026-04-30T10:00:00Z'),
  uuid_externo: '99999999-9999-4999-8999-999999999999',
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
  status: 'PENDENTE',
  observacao: null,
  dispensacao_origem_id: null,
  dispensacao_origem_data_hora: null,
  atendimento_uuid: ATEND_UUID,
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  prescricao_uuid: PRESC_UUID,
  cirurgia_uuid: null,
  setor_destino_uuid: null,
  farmaceutico_uuid: '00000000-0000-4000-8000-000000000040',
  dispensacao_origem_uuid: null,
} as const;

describe('CreateDispensacaoUseCase', () => {
  let repo: RepoMock;
  let permissions: { hasPermission: ReturnType<typeof vi.fn> };
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: CreateDispensacaoUseCase;

  beforeEach(() => {
    repo = buildRepo();
    permissions = { hasPermission: vi.fn().mockResolvedValue(true) };
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new CreateDispensacaoUseCase(
      repo as never,
      permissions as never,
      auditoria as never,
      events,
    );
    // Defaults
    repo.findAtendimentoBasics.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      setorId: 50n,
    });
    repo.findPrestadorIdByUserId.mockResolvedValue(40n);
    repo.findProcedimentosByUuids.mockResolvedValue(
      new Map([
        [
          PROC_UUID,
          {
            id: 100n,
            nome: 'Dipirona 500mg',
            grupoGasto: 'MEDICAMENTO',
            controlado: false,
            fatorConversao: '1',
          },
        ],
      ]),
    );
    repo.findPrescricaoItemIds.mockResolvedValue(new Map());
    repo.insertDispensacao.mockResolvedValue({
      id: 1n,
      dataHora: new Date('2026-04-30T10:00:00Z'),
      uuidExterno: DISP_ROW.uuid_externo,
    });
    repo.insertDispensacaoItem.mockResolvedValue({
      id: 1n,
      uuidExterno: '00000000-0000-4000-8000-000000000099',
    });
    repo.findDispensacaoByUuid.mockResolvedValue({ ...DISP_ROW });
    repo.findItensByDispensacaoId.mockResolvedValue([]);
  });

  function basePrescDto() {
    return {
      atendimentoUuid: ATEND_UUID,
      prescricaoUuid: PRESC_UUID,
      dataHora: '2026-04-30T10:00:00Z',
      tipo: 'PRESCRICAO' as const,
      itens: [
        {
          procedimentoUuid: PROC_UUID,
          quantidadePrescrita: 1,
          quantidadeDispensada: 1,
          unidadeMedida: 'CP',
        },
      ],
    };
  }

  it('atendimento inexistente → 404', async () => {
    repo.findAtendimentoBasics.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(basePrescDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('RN-FAR-01: prescrição em status diferente de ATIVA → 422', async () => {
    repo.findPrescricaoMin.mockResolvedValue({
      id: 30n,
      dataHora: new Date(),
      status: 'AGUARDANDO_ANALISE',
      atendimentoId: 10n,
    });
    await withCtx(async () => {
      await expect(useCase.execute(basePrescDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('prescrição de outro atendimento → 422', async () => {
    repo.findPrescricaoMin.mockResolvedValue({
      id: 30n,
      dataHora: new Date(),
      status: 'ATIVA',
      atendimentoId: 999n,
    });
    await withCtx(async () => {
      await expect(useCase.execute(basePrescDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('AVULSA sem motivoAvulsa → 400', async () => {
    const dto = {
      atendimentoUuid: ATEND_UUID,
      dataHora: '2026-04-30T10:00:00Z',
      tipo: 'AVULSA' as const,
      itens: [
        {
          procedimentoUuid: PROC_UUID,
          quantidadePrescrita: 1,
          quantidadeDispensada: 1,
        },
      ],
    };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('AVULSA sem permissão dispensacao:avulsa → 403', async () => {
    permissions.hasPermission.mockResolvedValue(false);
    const dto = {
      atendimentoUuid: ATEND_UUID,
      dataHora: '2026-04-30T10:00:00Z',
      tipo: 'AVULSA' as const,
      motivoAvulsa: 'paciente em parada respiratória',
      itens: [
        {
          procedimentoUuid: PROC_UUID,
          quantidadePrescrita: 1,
          quantidadeDispensada: 1,
        },
      ],
    };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  it('RN-FAR-03: divergência prescrita×dispensada sem justificativa → 422', async () => {
    repo.findPrescricaoMin.mockResolvedValue({
      id: 30n,
      dataHora: new Date(),
      status: 'ATIVA',
      atendimentoId: 10n,
    });
    const dto = basePrescDto();
    // fatorConversao=1 default, divergência sem justificativa
    dto.itens = [
      {
        procedimentoUuid: PROC_UUID,
        quantidadePrescrita: 2,
        quantidadeDispensada: 1.5,
        unidadeMedida: 'CP',
      },
    ];
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  it('RN-FAR-06: KIT_CIRURGICO sem itens nem kit associado → 400', async () => {
    repo.findCirurgiaMin.mockResolvedValue({
      id: 80n,
      atendimentoId: 10n,
      pacienteId: 20n,
      kitCirurgicoId: null,
    });
    const dto = {
      atendimentoUuid: ATEND_UUID,
      cirurgiaUuid: CIRURGIA_UUID,
      dataHora: '2026-04-30T10:00:00Z',
      tipo: 'KIT_CIRURGICO' as const,
      itens: [],
    };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('caminho feliz — emite event + audita', async () => {
    repo.findPrescricaoMin.mockResolvedValue({
      id: 30n,
      dataHora: new Date('2026-04-30T08:00:00Z'),
      status: 'ATIVA',
      atendimentoId: 10n,
    });
    const emitted: string[] = [];
    events.on('dispensacao.criada', () => emitted.push('criada'));
    await withCtx(() => useCase.execute(basePrescDto()));
    expect(repo.insertDispensacao).toHaveBeenCalledOnce();
    expect(repo.insertDispensacaoItem).toHaveBeenCalledOnce();
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['criada']);
  });

  it('cirurgia de outro atendimento → 422', async () => {
    repo.findCirurgiaMin.mockResolvedValue({
      id: 80n,
      atendimentoId: 999n,
      pacienteId: 20n,
      kitCirurgicoId: 7n,
    });
    repo.findKitItens.mockResolvedValue([]);
    const dto = {
      atendimentoUuid: ATEND_UUID,
      cirurgiaUuid: CIRURGIA_UUID,
      dataHora: '2026-04-30T10:00:00Z',
      tipo: 'KIT_CIRURGICO' as const,
      itens: [],
    };
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});
