/**
 * Testa `AutoAgendarUseCase`:
 *   - Quando convenioUuid vazio: delega direto ao CreateAgendamentoUseCase
 *     com origem=PORTAL e encaixe=false.
 *   - Quando convenioUuid presente mas paciente NÃO tem convênios → 400.
 *   - Quando convenioUuid presente e convênio NÃO está vinculado ao
 *     paciente → 400.
 *   - Quando convenioUuid + planoUuid não pertencem à carteirinha → 400.
 *   - Caminho feliz com convênio próprio.
 */
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoAgendarUseCase } from '../application/agendamentos/auto-agendar.use-case';

const ctxOk = {
  userId: 1n,
  tenantId: 7n,
  pacienteId: 99n,
  pacienteUuid: '00000000-0000-0000-0000-000000000099',
};

function makeResolver() {
  return { resolve: vi.fn(async () => ctxOk) };
}

function makePortalRepo(convenios: { convenio_id: bigint; plano_id: bigint | null }[]) {
  return {
    listConveniosAtivos: vi.fn(async () => convenios),
  };
}

function makeAgendamentoRepo(
  convenioMap: Record<string, bigint>,
  planoMap: Record<string, bigint> = {},
) {
  return {
    findConvenioIdByUuid: vi.fn(async (uuid: string) => convenioMap[uuid] ?? null),
    findPlanoIdByUuid: vi.fn(async (uuid: string) => planoMap[uuid] ?? null),
  };
}

function makeCreateAgendamentoUC(returnValue: unknown = { uuid: 'agend-uuid' }) {
  return { execute: vi.fn(async () => returnValue) };
}

const baseDto = {
  recursoUuid: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
  inicio: '2026-05-10T10:00:00Z',
  fim: '2026-05-10T10:30:00Z',
  tipo: 'CONSULTA' as const,
};

describe('AutoAgendarUseCase', () => {
  let resolver: ReturnType<typeof makeResolver>;
  beforeEach(() => {
    resolver = makeResolver();
  });

  it('caminho sem convenio: delega com origem=PORTAL e encaixe=false', async () => {
    const portalRepo = makePortalRepo([]);
    const agRepo = makeAgendamentoRepo({});
    const createUC = makeCreateAgendamentoUC();
    const uc = new AutoAgendarUseCase(
      resolver as never,
      portalRepo as never,
      agRepo as never,
      createUC as never,
    );
    await uc.execute(baseDto);
    expect(createUC.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recursoUuid: baseDto.recursoUuid,
        pacienteUuid: ctxOk.pacienteUuid,
        origem: 'PORTAL',
        encaixe: false,
      }),
    );
  });

  it('400 quando paciente sem convênio ativo e convenioUuid presente', async () => {
    const portalRepo = makePortalRepo([]);
    const agRepo = makeAgendamentoRepo({
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc': 33n,
    });
    const uc = new AutoAgendarUseCase(
      resolver as never,
      portalRepo as never,
      agRepo as never,
      makeCreateAgendamentoUC() as never,
    );
    await expect(
      uc.execute({
        ...baseDto,
        convenioUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_PACIENTE_SEM_CONVENIO' },
    });
  });

  it('400 quando convenioUuid não pertence ao paciente', async () => {
    const portalRepo = makePortalRepo([
      { convenio_id: 11n, plano_id: null },
    ]);
    const agRepo = makeAgendamentoRepo({
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc': 22n,
    });
    const uc = new AutoAgendarUseCase(
      resolver as never,
      portalRepo as never,
      agRepo as never,
      makeCreateAgendamentoUC() as never,
    );
    await expect(
      uc.execute({
        ...baseDto,
        convenioUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 quando planoUuid não pertence à carteirinha do paciente', async () => {
    const portalRepo = makePortalRepo([
      { convenio_id: 22n, plano_id: 100n },
    ]);
    const agRepo = makeAgendamentoRepo(
      { 'cccccccc-cccc-4ccc-8ccc-cccccccccccc': 22n },
      { 'pppppppp-pppp-4ppp-8ppp-pppppppppppp': 999n },
    );
    const uc = new AutoAgendarUseCase(
      resolver as never,
      portalRepo as never,
      agRepo as never,
      makeCreateAgendamentoUC() as never,
    );
    await expect(
      uc.execute({
        ...baseDto,
        convenioUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        planoUuid: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PORTAL_PACIENTE_PLANO_NAO_VINCULADO' },
    });
  });

  it('caminho feliz com convênio próprio', async () => {
    const portalRepo = makePortalRepo([
      { convenio_id: 22n, plano_id: 100n },
    ]);
    const agRepo = makeAgendamentoRepo(
      { 'cccccccc-cccc-4ccc-8ccc-cccccccccccc': 22n },
      { 'pppppppp-pppp-4ppp-8ppp-pppppppppppp': 100n },
    );
    const createUC = makeCreateAgendamentoUC({ uuid: 'ag-1' });
    const uc = new AutoAgendarUseCase(
      resolver as never,
      portalRepo as never,
      agRepo as never,
      createUC as never,
    );
    const out = await uc.execute({
      ...baseDto,
      convenioUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      planoUuid: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp',
    });
    expect(out).toEqual({ uuid: 'ag-1' });
    expect(createUC.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        convenioUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        planoUuid: 'pppppppp-pppp-4ppp-8ppp-pppppppppppp',
        encaixe: false,
        origem: 'PORTAL',
      }),
    );
  });
});
