/**
 * Unit do fluxo OPME (RN-CC-03):
 *   - solicitar → autorizar → utilizar (caminho feliz).
 *   - utilizar sem autorizar (ELETIVA) → 422 OPME_AUTORIZACAO_REQUIRED.
 *   - utilizar EMERGENCIA sem motivo → 422 OPME_EMERGENCIA_SEM_MOTIVO.
 *   - utilizar EMERGENCIA com motivo → ok.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AutorizarOpmeUseCase } from '../application/opme/autorizar-opme.use-case';
import { SolicitarOpmeUseCase } from '../application/opme/solicitar-opme.use-case';
import { UtilizarOpmeUseCase } from '../application/opme/utilizar-opme.use-case';
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

const CIR_BASE = {
  id: 1n,
  uuid_externo: CIR_UUID,
  tenant_id: 1n,
  atendimento_id: 10n,
  atendimento_uuid: '00000000-0000-4000-8000-000000000010',
  paciente_id: 20n,
  paciente_uuid: '00000000-0000-4000-8000-000000000020',
  paciente_nome: null,
  procedimento_principal_id: 100n,
  procedimento_principal_uuid: '00000000-0000-4000-8000-000000000002',
  procedimento_principal_nome: null,
  procedimentos_secundarios: null,
  sala_id: 50n,
  sala_uuid: '00000000-0000-4000-8000-000000000050',
  sala_nome: 'S',
  setor_id: 70n,
  setor_uuid: null,
  data_hora_agendada: new Date('2026-05-02T10:00:00Z'),
  duracao_estimada_minutos: 60,
  data_hora_inicio: null,
  data_hora_fim: null,
  cirurgiao_id: 40n,
  cirurgiao_uuid: '00000000-0000-4000-8000-000000000004',
  cirurgiao_nome: null,
  tipo_anestesia: null,
  classificacao_cirurgia: 'ELETIVA' as const,
  exige_autorizacao_convenio: false,
  kit_cirurgico_id: null,
  kit_cirurgico_uuid: null,
  caderno_gabarito_id: null,
  caderno_gabarito_uuid: null,
  ficha_cirurgica: null,
  ficha_anestesica: null,
  intercorrencias: null,
  status: 'CONFIRMADA' as const,
  conta_id: null,
  conta_uuid: null,
  opme_solicitada: null,
  opme_autorizada: null,
  opme_utilizada: null,
  cancelamento_motivo: null,
  cancelado_em: null,
};

interface RepoMock {
  findCirurgiaByUuid: ReturnType<typeof vi.fn>;
  findEquipeByCirurgiaId: ReturnType<typeof vi.fn>;
  updateOpme: ReturnType<typeof vi.fn>;
}

function buildRepo(initial: typeof CIR_BASE): RepoMock {
  let current = { ...initial };
  return {
    findCirurgiaByUuid: vi.fn(async () => ({ ...current })),
    findEquipeByCirurgiaId: vi.fn(async () => []),
    updateOpme: vi.fn(async (args: {
      cirurgiaId: bigint;
      fase: 'solicitada' | 'autorizada' | 'utilizada';
      itens: unknown[];
    }) => {
      if (args.fase === 'solicitada') {
        current = { ...current, opme_solicitada: args.itens };
      } else if (args.fase === 'autorizada') {
        current = { ...current, opme_autorizada: args.itens };
      } else {
        current = { ...current, opme_utilizada: args.itens };
      }
    }),
  };
}

describe('OPME flow (RN-CC-03)', () => {
  let auditoria: { record: ReturnType<typeof vi.fn> };
  let events: EventEmitter2;

  beforeEach(() => {
    auditoria = { record: vi.fn().mockResolvedValue(undefined) };
    events = new EventEmitter2();
  });

  it('caminho feliz: solicitar → autorizar → utilizar', async () => {
    const repo = buildRepo(CIR_BASE);
    const solic = new SolicitarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    const aut = new AutorizarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    const util = new UtilizarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    const dto = {
      itens: [{ descricao: 'Parafuso', quantidade: 2 }],
    };

    await withCtx(() => solic.execute(CIR_UUID, dto));
    expect(repo.updateOpme).toHaveBeenLastCalledWith(
      expect.objectContaining({ fase: 'solicitada' }),
    );
    await withCtx(() => aut.execute(CIR_UUID, dto));
    expect(repo.updateOpme).toHaveBeenLastCalledWith(
      expect.objectContaining({ fase: 'autorizada' }),
    );
    await withCtx(() => util.execute(CIR_UUID, dto));
    expect(repo.updateOpme).toHaveBeenLastCalledWith(
      expect.objectContaining({ fase: 'utilizada' }),
    );
  });

  it('utilizar ELETIVA sem autorizar → 422', async () => {
    const repo = buildRepo(CIR_BASE);
    const util = new UtilizarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    await withCtx(async () => {
      await expect(
        util.execute(CIR_UUID, {
          itens: [{ descricao: 'Parafuso', quantidade: 1 }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('utilizar EMERGENCIA sem motivoUrgencia → 422', async () => {
    const repo = buildRepo({
      ...CIR_BASE,
      classificacao_cirurgia: 'EMERGENCIA',
    });
    const util = new UtilizarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    await withCtx(async () => {
      await expect(
        util.execute(CIR_UUID, {
          itens: [{ descricao: 'Parafuso', quantidade: 1 }],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  it('utilizar EMERGENCIA com motivoUrgencia → ok', async () => {
    const repo = buildRepo({
      ...CIR_BASE,
      classificacao_cirurgia: 'EMERGENCIA',
    });
    const util = new UtilizarOpmeUseCase(
      repo as never,
      auditoria as never,
      events,
    );
    await withCtx(() =>
      util.execute(CIR_UUID, {
        itens: [
          {
            descricao: 'Parafuso',
            quantidade: 1,
            motivoUrgencia: 'fratura exposta de fêmur',
          },
        ],
      }),
    );
    expect(repo.updateOpme).toHaveBeenCalledWith(
      expect.objectContaining({ fase: 'utilizada' }),
    );
  });
});
