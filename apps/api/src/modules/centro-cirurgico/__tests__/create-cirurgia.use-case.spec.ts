/**
 * Unit do `CreateCirurgiaUseCase`.
 *
 * Cobre:
 *   - Equipe sem CIRURGIAO → 400 (RN-CC-01).
 *   - Atendimento não encontrado → 404.
 *   - Sala não encontrada → 404.
 *   - Sala ocupada (conflito de agenda) → 409 (RN-CC-01).
 *   - Caminho feliz: insert + equipe + audit + evento.
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateCirurgiaUseCase } from '../application/cirurgias/create-cirurgia.use-case';
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
const SALA_UUID = '00000000-0000-4000-8000-000000000003';
const CIRURGIAO_UUID = '00000000-0000-4000-8000-000000000004';
const CIR_UUID = '99999999-9999-4999-8999-999999999999';

interface RepoMock {
  findAtendimentoBasics: ReturnType<typeof vi.fn>;
  findSalaByUuid: ReturnType<typeof vi.fn>;
  findProcedimentosByUuids: ReturnType<typeof vi.fn>;
  findPrestadorIdsByUuids: ReturnType<typeof vi.fn>;
  findKitIdByUuid: ReturnType<typeof vi.fn>;
  findGabaritoIdByUuid: ReturnType<typeof vi.fn>;
  findSalaConflicts: ReturnType<typeof vi.fn>;
  insertCirurgia: ReturnType<typeof vi.fn>;
  insertEquipe: ReturnType<typeof vi.fn>;
  findCirurgiaByUuid: ReturnType<typeof vi.fn>;
  findEquipeByCirurgiaId: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findAtendimentoBasics: vi.fn(),
    findSalaByUuid: vi.fn(),
    findProcedimentosByUuids: vi.fn(),
    findPrestadorIdsByUuids: vi.fn(),
    findKitIdByUuid: vi.fn(),
    findGabaritoIdByUuid: vi.fn(),
    findSalaConflicts: vi.fn(),
    insertCirurgia: vi.fn(),
    insertEquipe: vi.fn(),
    findCirurgiaByUuid: vi.fn(),
    findEquipeByCirurgiaId: vi.fn(),
  };
}

const CIR_ROW = {
  id: 1n,
  uuid_externo: CIR_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  atendimento_uuid: ATEND_UUID,
  paciente_id: 20n,
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  paciente_nome: 'Paciente Teste',
  procedimento_principal_id: 100n,
  procedimento_principal_uuid: PROC_UUID,
  procedimento_principal_nome: 'Apendicectomia',
  procedimentos_secundarios: { items: [], _meta: { exigeAutorizacaoConvenio: false } },
  sala_id: 50n,
  sala_uuid: SALA_UUID,
  sala_nome: 'Sala 1',
  setor_id: 70n,
  setor_uuid: '00000000-0000-4000-8000-000000000070',
  data_hora_agendada: new Date('2026-05-02T10:00:00Z'),
  duracao_estimada_minutos: 60,
  data_hora_inicio: null,
  data_hora_fim: null,
  cirurgiao_id: 40n,
  cirurgiao_uuid: CIRURGIAO_UUID,
  cirurgiao_nome: 'Dr Cirurgião',
  tipo_anestesia: 'GERAL',
  classificacao_cirurgia: 'ELETIVA',
  exige_autorizacao_convenio: false,
  kit_cirurgico_id: null,
  kit_cirurgico_uuid: null,
  caderno_gabarito_id: null,
  caderno_gabarito_uuid: null,
  ficha_cirurgica: null,
  ficha_anestesica: null,
  intercorrencias: null,
  status: 'AGENDADA',
  conta_id: null,
  conta_uuid: null,
  opme_solicitada: null,
  opme_autorizada: null,
  opme_utilizada: null,
  cancelamento_motivo: null,
  cancelado_em: null,
} as const;

function baseDto() {
  return {
    atendimentoUuid: ATEND_UUID,
    procedimentoPrincipalUuid: PROC_UUID,
    salaUuid: SALA_UUID,
    dataHoraAgendada: '2026-05-02T10:00:00Z',
    duracaoEstimadaMinutos: 60,
    cirurgiaoUuid: CIRURGIAO_UUID,
    classificacaoCirurgia: 'ELETIVA' as const,
    equipe: [
      {
        prestadorUuid: CIRURGIAO_UUID,
        funcao: 'CIRURGIAO',
      },
      {
        prestadorUuid: '00000000-0000-4000-8000-000000000005',
        funcao: 'ANESTESISTA',
      },
    ],
  };
}

describe('CreateCirurgiaUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: CreateCirurgiaUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new CreateCirurgiaUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.findAtendimentoBasics.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      setorId: 70n,
      contaId: 200n,
    });
    repo.findSalaByUuid.mockResolvedValue({
      id: 50n,
      setorId: 70n,
      nome: 'Sala 1',
    });
    repo.findProcedimentosByUuids.mockResolvedValue(
      new Map([
        [
          PROC_UUID,
          {
            id: 100n,
            nome: 'Apendicectomia',
            grupoGasto: 'PROCEDIMENTO',
            tipo: 'PROCEDIMENTO',
          },
        ],
      ]),
    );
    repo.findPrestadorIdsByUuids.mockResolvedValue(
      new Map([
        [CIRURGIAO_UUID, { id: 40n, nome: 'Dr Cirurgião' }],
        [
          '00000000-0000-4000-8000-000000000005',
          { id: 41n, nome: 'Dr Anestesista' },
        ],
      ]),
    );
    repo.findSalaConflicts.mockResolvedValue([]);
    repo.insertCirurgia.mockResolvedValue({
      id: 1n,
      uuidExterno: CIR_UUID,
    });
    repo.insertEquipe.mockResolvedValue({ id: 1n });
    repo.findCirurgiaByUuid.mockResolvedValue({ ...CIR_ROW });
    repo.findEquipeByCirurgiaId.mockResolvedValue([]);
  });

  it('equipe sem CIRURGIAO → 400 (RN-CC-01)', async () => {
    const dto = baseDto();
    dto.equipe = [
      {
        prestadorUuid: '00000000-0000-4000-8000-000000000005',
        funcao: 'ANESTESISTA',
      },
    ];
    await withCtx(async () => {
      await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('atendimento inexistente → 404', async () => {
    repo.findAtendimentoBasics.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('sala inexistente → 404', async () => {
    repo.findSalaByUuid.mockResolvedValue(null);
    await withCtx(async () => {
      await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('RN-CC-01: sala ocupada → 409 estruturado', async () => {
    repo.findSalaConflicts.mockResolvedValue([
      {
        id: 99n,
        uuid_externo: '88888888-8888-4888-8888-888888888888',
        data_hora_inicio: new Date('2026-05-02T09:30:00Z'),
      },
    ]);
    await withCtx(async () => {
      await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  it('caminho feliz: insert + equipe + audita + evento', async () => {
    const emitted: string[] = [];
    events.on('cirurgia.agendada', () => emitted.push('agendada'));
    await withCtx(() => useCase.execute(baseDto()));
    expect(repo.insertCirurgia).toHaveBeenCalledOnce();
    expect(repo.insertEquipe).toHaveBeenCalledTimes(2);
    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(emitted).toEqual(['agendada']);
  });
});
