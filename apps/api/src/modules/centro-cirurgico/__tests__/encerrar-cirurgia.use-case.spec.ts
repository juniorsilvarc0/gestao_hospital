/**
 * Unit do `EncerrarCirurgiaUseCase`.
 *
 * Cobre:
 *   - 422 quando ficha cirúrgica/anestésica/inicio ausentes (RN-CC-04).
 *   - 422 quando dataHoraFim <= data_hora_inicio.
 *   - 409 quando status != EM_ANDAMENTO.
 *   - Caminho feliz: gera contas_itens (proc principal + secundários +
 *     gabarito + OPME + honorários da equipe) — RN-CC-06, RN-CC-08.
 */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EncerrarCirurgiaUseCase } from '../application/cirurgias/encerrar-cirurgia.use-case';
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

const CIR_UUID = '99999999-9999-4999-8999-999999999999';
const PROC_UUID = '00000000-0000-4000-8000-000000000002';
const PROC_SEC_UUID = '00000000-0000-4000-8000-000000000020';
const PROC_GAB_UUID = '00000000-0000-4000-8000-000000000030';
const OPME_PROC_UUID = '00000000-0000-4000-8000-000000000040';

interface RepoMock {
  findCirurgiaByUuid: ReturnType<typeof vi.fn>;
  findAtendimentoBasics: ReturnType<typeof vi.fn>;
  updateCirurgiaEncerramento: ReturnType<typeof vi.fn>;
  insertContaItem: ReturnType<typeof vi.fn>;
  findGabaritoItensByCadernoId: ReturnType<typeof vi.fn>;
  findProcedimentosByUuids: ReturnType<typeof vi.fn>;
  findEquipeByCirurgiaId: ReturnType<typeof vi.fn>;
  setEquipeContaItem: ReturnType<typeof vi.fn>;
  setCirurgiaContaId: ReturnType<typeof vi.fn>;
}

function buildRepo(): RepoMock {
  return {
    findCirurgiaByUuid: vi.fn(),
    findAtendimentoBasics: vi.fn(),
    updateCirurgiaEncerramento: vi.fn().mockResolvedValue(undefined),
    insertContaItem: vi.fn(),
    findGabaritoItensByCadernoId: vi.fn(),
    findProcedimentosByUuids: vi.fn(),
    findEquipeByCirurgiaId: vi.fn(),
    setEquipeContaItem: vi.fn().mockResolvedValue(undefined),
    setCirurgiaContaId: vi.fn().mockResolvedValue(undefined),
  };
}

const CIR_ROW_BASE = {
  id: 1n,
  uuid_externo: CIR_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  atendimento_uuid: '00000000-0000-4000-8000-000000000010',
  paciente_id: 20n,
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  paciente_nome: 'P',
  procedimento_principal_id: 100n,
  procedimento_principal_uuid: PROC_UUID,
  procedimento_principal_nome: 'Apendicectomia',
  procedimentos_secundarios: {
    items: [
      {
        procedimentoUuid: PROC_SEC_UUID,
        procedimentoId: '101',
        quantidade: 1,
      },
    ],
    _meta: { exigeAutorizacaoConvenio: false },
  },
  sala_id: 50n,
  sala_uuid: '00000000-0000-4000-8000-000000000050',
  sala_nome: 'Sala 1',
  setor_id: 70n,
  setor_uuid: '00000000-0000-4000-8000-000000000070',
  data_hora_agendada: new Date('2026-05-02T10:00:00Z'),
  duracao_estimada_minutos: 60,
  data_hora_inicio: new Date('2026-05-02T10:05:00Z'),
  data_hora_fim: null,
  cirurgiao_id: 40n,
  cirurgiao_uuid: '00000000-0000-4000-8000-000000000004',
  cirurgiao_nome: 'Dr',
  tipo_anestesia: 'GERAL',
  classificacao_cirurgia: 'ELETIVA',
  exige_autorizacao_convenio: false,
  kit_cirurgico_id: null,
  kit_cirurgico_uuid: null,
  caderno_gabarito_id: 800n,
  caderno_gabarito_uuid: '00000000-0000-4000-8000-000000000800',
  ficha_cirurgica: { ok: true },
  ficha_anestesica: { ok: true },
  intercorrencias: null,
  status: 'EM_ANDAMENTO',
  conta_id: 200n,
  conta_uuid: '00000000-0000-4000-8000-000000000200',
  opme_solicitada: null,
  opme_autorizada: null,
  opme_utilizada: [
    {
      procedimentoUuid: OPME_PROC_UUID,
      descricao: 'Parafuso',
      quantidade: 2,
      lote: 'L1',
      registroAnvisa: 'ANVISA-1',
      fabricante: 'Fab1',
    },
  ],
  cancelamento_motivo: null,
  cancelado_em: null,
} as const;

describe('EncerrarCirurgiaUseCase', () => {
  let repo: RepoMock;
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;
  let useCase: EncerrarCirurgiaUseCase;

  beforeEach(() => {
    repo = buildRepo();
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
    useCase = new EncerrarCirurgiaUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    repo.findCirurgiaByUuid.mockResolvedValue({ ...CIR_ROW_BASE });
    repo.findAtendimentoBasics.mockResolvedValue({
      id: 10n,
      pacienteId: 20n,
      setorId: 70n,
      contaId: 200n,
    });
    repo.findGabaritoItensByCadernoId.mockResolvedValue([
      {
        id: 1n,
        caderno_id: 800n,
        procedimento_id: 102n,
        procedimento_uuid: PROC_GAB_UUID,
        procedimento_nome: 'Compressa',
        procedimento_grupo_gasto: 'MATERIAL',
        quantidade_padrao: '5',
        obrigatorio: true,
        observacao: null,
      },
    ]);
    repo.findProcedimentosByUuids.mockImplementation(
      async (uuids: string[]) => {
        const map = new Map<
          string,
          { id: bigint; nome: string; grupoGasto: string; tipo: string }
        >();
        if (uuids.includes(PROC_SEC_UUID)) {
          map.set(PROC_SEC_UUID, {
            id: 101n,
            nome: 'Drenagem',
            grupoGasto: 'PROCEDIMENTO',
            tipo: 'PROCEDIMENTO',
          });
        }
        if (uuids.includes(OPME_PROC_UUID)) {
          map.set(OPME_PROC_UUID, {
            id: 110n,
            nome: 'Parafuso 4mm',
            grupoGasto: 'OPME',
            tipo: 'OPME',
          });
        }
        return map;
      },
    );
    repo.findEquipeByCirurgiaId.mockResolvedValue([
      {
        id: 1n,
        cirurgia_id: 1n,
        prestador_id: 40n,
        prestador_uuid: '00000000-0000-4000-8000-000000000004',
        prestador_nome: 'Dr',
        funcao: 'CIRURGIAO',
        ordem: 1,
        conta_item_id: null,
        conta_item_uuid: null,
      },
      {
        id: 2n,
        cirurgia_id: 1n,
        prestador_id: 41n,
        prestador_uuid: '00000000-0000-4000-8000-000000000005',
        prestador_nome: 'Dr A',
        funcao: 'ANESTESISTA',
        ordem: 2,
        conta_item_id: null,
        conta_item_uuid: null,
      },
    ]);
    let nextId = 1000n;
    repo.insertContaItem.mockImplementation(async () => {
      const id = nextId;
      nextId += 1n;
      return { id, uuidExterno: 'ci-' + id.toString() };
    });
  });

  it('RN-CC-04: ficha ausente → 422', async () => {
    const cir = { ...CIR_ROW_BASE, ficha_cirurgica: null };
    repo.findCirurgiaByUuid.mockResolvedValue(cir);
    await withCtx(async () => {
      await expect(
        useCase.execute(CIR_UUID, {
          dataHoraFim: '2026-05-02T11:30:00Z',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('422 quando dataHoraFim <= dataHoraInicio', async () => {
    await withCtx(async () => {
      await expect(
        useCase.execute(CIR_UUID, {
          dataHoraFim: '2026-05-02T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('409 fora de EM_ANDAMENTO', async () => {
    repo.findCirurgiaByUuid.mockResolvedValue({
      ...CIR_ROW_BASE,
      status: 'CONFIRMADA',
    });
    await withCtx(async () => {
      await expect(
        useCase.execute(CIR_UUID, {
          dataHoraFim: '2026-05-02T11:00:00Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('caminho feliz: gera contas_itens (principal + sec + gabarito + opme + equipe)', async () => {
    const emitted: string[] = [];
    events.on('cirurgia.encerrada', () => emitted.push('encerrada'));
    await withCtx(() =>
      useCase.execute(CIR_UUID, {
        dataHoraFim: '2026-05-02T11:30:00Z',
      }),
    );
    // 1 principal + 1 secundário + 1 gabarito + 1 OPME + 2 honorários = 6
    expect(repo.insertContaItem).toHaveBeenCalledTimes(6);
    expect(repo.setEquipeContaItem).toHaveBeenCalledTimes(2);
    expect(repo.setCirurgiaContaId).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual(['encerrada']);
  });

  it('sem conta aberta: não emite contas_itens, registra audit', async () => {
    repo.findCirurgiaByUuid.mockResolvedValue({
      ...CIR_ROW_BASE,
      conta_id: null,
    });
    await withCtx(() =>
      useCase.execute(CIR_UUID, {
        dataHoraFim: '2026-05-02T11:30:00Z',
      }),
    );
    expect(repo.insertContaItem).not.toHaveBeenCalled();
    expect(auditoria.record).toHaveBeenCalled();
  });
});
