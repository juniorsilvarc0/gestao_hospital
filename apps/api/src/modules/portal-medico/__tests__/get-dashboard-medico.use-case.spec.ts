/**
 * Testes do `GetDashboardMedicoUseCase`. Mocks de
 * `PortalMedicoRepository` e `RepasseRepository`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetDashboardMedicoUseCase } from '../application/get-dashboard-medico.use-case';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';

const CTX: MedicoRequestContext = {
  userId: 42n,
  tenantId: 1n,
  prestadorId: 99n,
};

function makeRepo(opts: {
  cirurgiasProximas?: Array<{
    id: bigint;
    uuid_externo: string;
    data_hora_agendada: Date;
    duracao_estimada_minutos: number | null;
    paciente_uuid: string;
    paciente_nome: string | null;
    procedimento_principal_uuid: string;
    procedimento_principal_nome: string | null;
    sala_uuid: string;
    sala_nome: string;
    status: string;
    papel: 'CIRURGIAO' | 'EQUIPE';
    funcao: string | null;
  }>;
  proximaConsulta?: ReturnType<typeof makeProximaConsulta> | null;
} = {}): {
  countAgendamentosRange: ReturnType<typeof vi.fn>;
  countCirurgiasRange: ReturnType<typeof vi.fn>;
  countLaudosPendentes: ReturnType<typeof vi.fn>;
  findCirurgiasDoMedico: ReturnType<typeof vi.fn>;
  findProximaConsulta: ReturnType<typeof vi.fn>;
  findProducaoTotais: ReturnType<typeof vi.fn>;
} {
  return {
    countAgendamentosRange: vi
      .fn()
      .mockResolvedValueOnce(2) // hoje
      .mockResolvedValueOnce(8), // semana
    countCirurgiasRange: vi
      .fn()
      .mockResolvedValueOnce(1) // hoje
      .mockResolvedValueOnce(3), // semana
    countLaudosPendentes: vi.fn(async () => 5),
    findCirurgiasDoMedico: vi.fn(async () => opts.cirurgiasProximas ?? []),
    findProximaConsulta: vi.fn(async () =>
      opts.proximaConsulta === undefined
        ? makeProximaConsulta()
        : opts.proximaConsulta,
    ),
    findProducaoTotais: vi.fn(async () => ({
      total_atendimentos: 30,
      total_cirurgias: 5,
      total_laudos: 10,
    })),
  };
}

function makeProximaConsulta(): {
  agendamento_uuid: string;
  inicio: Date;
  paciente_uuid: string;
  paciente_nome: string;
  recurso_uuid: string;
  tipo: string;
  link_teleconsulta: string | null;
} {
  return {
    agendamento_uuid: '00000000-0000-4000-8000-000000000a01',
    inicio: new Date('2026-05-02T10:00:00Z'),
    paciente_uuid: '00000000-0000-4000-8000-000000000b01',
    paciente_nome: 'Paciente Próximo',
    recurso_uuid: '00000000-0000-4000-8000-000000000c01',
    tipo: 'CONSULTA',
    link_teleconsulta: null,
  };
}

function makeCirurgia(opts: {
  uuid?: string;
  dataHora: string;
}): {
  id: bigint;
  uuid_externo: string;
  data_hora_agendada: Date;
  duracao_estimada_minutos: number | null;
  paciente_uuid: string;
  paciente_nome: string;
  procedimento_principal_uuid: string;
  procedimento_principal_nome: string;
  sala_uuid: string;
  sala_nome: string;
  status: string;
  papel: 'CIRURGIAO';
  funcao: string;
} {
  return {
    id: 1n,
    uuid_externo: opts.uuid ?? '00000000-0000-4000-8000-000000000d01',
    data_hora_agendada: new Date(opts.dataHora),
    duracao_estimada_minutos: 90,
    paciente_uuid: '00000000-0000-4000-8000-000000000b02',
    paciente_nome: 'Paciente Cirurgia',
    procedimento_principal_uuid: '00000000-0000-4000-8000-000000000e01',
    procedimento_principal_nome: 'Apendicectomia',
    sala_uuid: '00000000-0000-4000-8000-000000000f01',
    sala_nome: 'SO 02',
    status: 'AGENDADA',
    papel: 'CIRURGIAO',
    funcao: 'CIRURGIAO',
  };
}

function makeRepasseRepo(opts: { repasse?: Record<string, unknown> | null } = {}): {
  findRepassePorPrestadorCompetencia: ReturnType<typeof vi.fn>;
} {
  return {
    findRepassePorPrestadorCompetencia: vi.fn(async () =>
      opts.repasse === undefined ? null : opts.repasse,
    ),
  };
}

describe('GetDashboardMedicoUseCase', () => {
  let repo: ReturnType<typeof makeRepo>;
  let repasseRepo: ReturnType<typeof makeRepasseRepo>;

  beforeEach(() => {
    repo = makeRepo();
    repasseRepo = makeRepasseRepo();
  });

  it('agrega contadores hoje + semana', async () => {
    const uc = new GetDashboardMedicoUseCase(
      repo as never,
      repasseRepo as never,
    );
    const out = await uc.execute(CTX);
    expect(out.hoje.agendamentos).toBe(2);
    expect(out.hoje.cirurgias).toBe(1);
    expect(out.hoje.laudosPendentes).toBe(5);
    expect(out.semana.agendamentos).toBe(8);
    expect(out.semana.cirurgias).toBe(3);
  });

  it('competenciaAtual sem repasse → producaoTotal.qtd somada', async () => {
    const uc = new GetDashboardMedicoUseCase(
      repo as never,
      repasseRepo as never,
    );
    const out = await uc.execute(CTX);
    expect(out.competenciaAtual.repasse).toBeNull();
    expect(out.competenciaAtual.producaoTotal.qtd).toBe(45); // 30+5+10
    expect(out.competenciaAtual.producaoTotal.valor).toBe('0.0000');
  });

  it('competenciaAtual com repasse → valorBruto refletido', async () => {
    repasseRepo = makeRepasseRepo({
      repasse: {
        id: 1n,
        uuid_externo: '00000000-0000-4000-8000-000000000aa1',
        prestador_id: 99n,
        competencia: '2026-05',
        status: 'APURADO',
        valor_bruto: '12000.0000',
        valor_liquido: '10800.0000',
        valor_creditos: '0',
        valor_debitos: '0',
        valor_descontos: '1200.0000',
        valor_impostos: '0',
        qtd_itens: 25,
      },
    });
    const uc = new GetDashboardMedicoUseCase(
      repo as never,
      repasseRepo as never,
    );
    const out = await uc.execute(CTX);
    expect(out.competenciaAtual.repasse).toEqual({
      uuid: '00000000-0000-4000-8000-000000000aa1',
      status: 'APURADO',
      valorLiquido: '10800.0000',
      qtdItens: 25,
    });
    expect(out.competenciaAtual.producaoTotal.valor).toBe('12000.0000');
  });

  it('proximas (top5) inclui consulta + cirurgias ordenadas por data', async () => {
    repo = makeRepo({
      cirurgiasProximas: [
        makeCirurgia({
          uuid: '00000000-0000-4000-8000-0000000000c1',
          dataHora: '2026-05-03T08:00:00Z',
        }),
        makeCirurgia({
          uuid: '00000000-0000-4000-8000-0000000000c2',
          dataHora: '2026-05-04T08:00:00Z',
        }),
      ],
    });
    const uc = new GetDashboardMedicoUseCase(
      repo as never,
      repasseRepo as never,
    );
    const out = await uc.execute(CTX);
    expect(out.proximas.length).toBeGreaterThanOrEqual(2);
    const tipos = out.proximas.map((p) => p.tipo);
    expect(tipos).toContain('consulta');
    expect(tipos).toContain('cirurgia');
    // Ordenação ascendente por data.
    for (let i = 1; i < out.proximas.length; i++) {
      expect(
        new Date(out.proximas[i].data).getTime(),
      ).toBeGreaterThanOrEqual(new Date(out.proximas[i - 1].data).getTime());
    }
  });

  it('proximas vazia quando sem consulta nem cirurgias', async () => {
    repo = makeRepo({ proximaConsulta: null, cirurgiasProximas: [] });
    const uc = new GetDashboardMedicoUseCase(
      repo as never,
      repasseRepo as never,
    );
    const out = await uc.execute(CTX);
    expect(out.proximas).toEqual([]);
  });
});
