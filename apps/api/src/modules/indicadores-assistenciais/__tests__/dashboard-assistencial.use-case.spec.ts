/**
 * Testes unitários do `GetDashboardAssistencialUseCase` — agrega 4
 * queries das MVs assistenciais em um único snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetDashboardAssistencialUseCase } from '../application/get-dashboard-assistencial.use-case';

function ocupacaoRow(): {
  tenant_id: bigint;
  dia: Date;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  leitos_ocupados: bigint;
  leitos_disponiveis: bigint;
  leitos_reservados: bigint;
  leitos_higienizacao: bigint;
  leitos_manutencao: bigint;
  leitos_bloqueados: bigint;
  total_leitos: bigint;
  taxa_ocupacao_pct: string | null;
} {
  return {
    tenant_id: 1n,
    dia: new Date('2026-05-04T00:00:00Z'),
    setor_id: 10n,
    setor_uuid: 's1',
    setor_nome: 'Setor A',
    leitos_ocupados: 30n,
    leitos_disponiveis: 10n,
    leitos_reservados: 0n,
    leitos_higienizacao: 0n,
    leitos_manutencao: 0n,
    leitos_bloqueados: 0n,
    total_leitos: 40n,
    taxa_ocupacao_pct: '75.00',
  };
}

function permanenciaRow(args: {
  qtd: bigint;
  media: string;
}): {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  qtd_internacoes: bigint;
  permanencia_media_dias: string | null;
  permanencia_mediana_dias: string | null;
} {
  return {
    tenant_id: 1n,
    competencia: '2026-05',
    setor_id: 10n,
    setor_uuid: 's1',
    setor_nome: 'Setor A',
    qtd_internacoes: args.qtd,
    permanencia_media_dias: args.media,
    permanencia_mediana_dias: null,
  };
}

function mortalidadeRow(args: {
  altas: bigint;
  obitos: bigint;
}): {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  altas_total: bigint;
  obitos: bigint;
  taxa_mortalidade_pct: string | null;
} {
  return {
    tenant_id: 1n,
    competencia: '2026-05',
    setor_id: 10n,
    setor_uuid: 's1',
    setor_nome: 'Setor A',
    altas_total: args.altas,
    obitos: args.obitos,
    taxa_mortalidade_pct: null,
  };
}

function irasRow(args: {
  casos: bigint;
  dias: string;
}): {
  tenant_id: bigint;
  competencia: string;
  setor_id: bigint;
  setor_uuid: string | null;
  setor_nome: string;
  casos_iras: bigint;
  dias_paciente: string;
  taxa_por_1000_paciente_dias: string | null;
} {
  return {
    tenant_id: 1n,
    competencia: '2026-05',
    setor_id: 10n,
    setor_uuid: 's1',
    setor_nome: 'Setor A',
    casos_iras: args.casos,
    dias_paciente: args.dias,
    taxa_por_1000_paciente_dias: null,
  };
}

function buildRepo(): {
  findTaxaOcupacao: ReturnType<typeof vi.fn>;
  findPermanencia: ReturnType<typeof vi.fn>;
  findMortalidade: ReturnType<typeof vi.fn>;
  findIras: ReturnType<typeof vi.fn>;
  findUltimaAtualizacao: ReturnType<typeof vi.fn>;
} {
  return {
    findTaxaOcupacao: vi.fn(async () => [ocupacaoRow()]),
    findPermanencia: vi.fn(async () => [
      permanenciaRow({ qtd: 10n, media: '4.00' }),
      permanenciaRow({ qtd: 5n, media: '6.00' }),
    ]),
    findMortalidade: vi.fn(async () => [
      mortalidadeRow({ altas: 80n, obitos: 4n }),
      mortalidadeRow({ altas: 20n, obitos: 1n }),
    ]),
    findIras: vi.fn(async () => [
      irasRow({ casos: 3n, dias: '500' }),
      irasRow({ casos: 2n, dias: '500' }),
    ]),
    findUltimaAtualizacao: vi.fn(async () => ({
      iniciadoEm: new Date('2026-05-04T06:00:00Z'),
      fonteRefreshUuid: 'meta-uuid',
    })),
  };
}

describe('GetDashboardAssistencialUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
  });

  it('agrega ocupação, permanência, mortalidade e IRAS em um snapshot', async () => {
    const uc = new GetDashboardAssistencialUseCase(repo as never);
    const out = await uc.execute({ competencia: '2026-05' });

    // 4 queries paralelas + meta = 5 chamadas, todas com filtros corretos.
    expect(repo.findTaxaOcupacao).toHaveBeenCalledTimes(1);
    expect(repo.findPermanencia).toHaveBeenCalledWith(
      expect.objectContaining({
        competenciaInicio: '2026-05',
        competenciaFim: '2026-05',
      }),
    );

    // Ocupação: 30 ocupados / 40 total → 75.00%.
    expect(out.ocupacaoHoje.totalLeitos).toBe(40);
    expect(out.ocupacaoHoje.ocupados).toBe(30);
    expect(out.ocupacaoHoje.taxaPctMedia).toBe('75.00');

    // Permanência: média ponderada (10*4 + 5*6) / 15 = 70/15 = 4.67.
    expect(out.permanenciaMedia.qtdInternacoes).toBe(15);
    expect(out.permanenciaMedia.dias).toBe('4.67');

    // Mortalidade: (4+1) / (80+20) = 5%.
    expect(out.mortalidadeMes.totalAltas).toBe(100);
    expect(out.mortalidadeMes.obitos).toBe(5);
    expect(out.mortalidadeMes.taxaPct).toBe('5.00');

    // IRAS: 1000 * 5 / 1000 = 5.00 por 1000 paciente-dias.
    expect(out.iras.totalCasos).toBe(5);
    expect(out.iras.taxaMedia1000Dias).toBe('5.00');

    expect(out.atualizacao.fonteRefreshUuid).toBe('meta-uuid');
    expect(out.competencia).toBe('2026-05');
  });

  it('com MVs vazias: devolve nulls nas taxas e zeros nos totais', async () => {
    repo.findTaxaOcupacao.mockResolvedValueOnce([]);
    repo.findPermanencia.mockResolvedValueOnce([]);
    repo.findMortalidade.mockResolvedValueOnce([]);
    repo.findIras.mockResolvedValueOnce([]);
    const uc = new GetDashboardAssistencialUseCase(repo as never);
    const out = await uc.execute({ competencia: '2026-05' });

    expect(out.ocupacaoHoje.totalLeitos).toBe(0);
    expect(out.ocupacaoHoje.taxaPctMedia).toBeNull();
    expect(out.permanenciaMedia.dias).toBeNull();
    expect(out.mortalidadeMes.taxaPct).toBeNull();
    expect(out.iras.taxaMedia1000Dias).toBeNull();
  });
});
