/**
 * Testes unitários do `GetDashboardExecutivoUseCase` — agrega resumo
 * cross-domain e tendências de 6 meses em um único snapshot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetDashboardExecutivoUseCase } from '../application/get-dashboard-executivo.use-case';

function buildResumoRow(): {
  pacientes_atendidos: bigint | null;
  cirurgias_realizadas: bigint | null;
  taxa_ocupacao_pct: string | null;
  permanencia_media_dias: string | null;
  mortalidade_pct: string | null;
  iras_total_casos: bigint | null;
  iras_taxa_1000: string | null;
  faturamento_bruto: string | null;
  faturamento_liquido: string | null;
  glosa_pct: string | null;
  repasse_total: string | null;
  no_show_pct: string | null;
} {
  return {
    pacientes_atendidos: 1200n,
    cirurgias_realizadas: 80n,
    taxa_ocupacao_pct: '78.50',
    permanencia_media_dias: '4.20',
    mortalidade_pct: '2.10',
    iras_total_casos: 12n,
    iras_taxa_1000: '4.80',
    faturamento_bruto: '1500000.0000',
    faturamento_liquido: '1380000.0000',
    glosa_pct: '5.20',
    repasse_total: '180000.0000',
    no_show_pct: '6.00',
  };
}

function buildTendenciaRow(competencia: string): {
  competencia: string;
  ocupacao_pct: string | null;
  faturamento_bruto: string | null;
  glosa_pct: string | null;
  mortalidade_pct: string | null;
} {
  return {
    competencia,
    ocupacao_pct: '70.00',
    faturamento_bruto: '1000000.0000',
    glosa_pct: '5.00',
    mortalidade_pct: '2.00',
  };
}

function buildRepo(opts: {
  resumo?: ReturnType<typeof buildResumoRow> | null;
  tendencias?: ReturnType<typeof buildTendenciaRow>[];
  meta?: { iniciadoEm: Date; fonteRefreshUuid: string } | null;
} = {}): {
  findResumoExecutivo: ReturnType<typeof vi.fn>;
  findTendenciasUltimos6Meses: ReturnType<typeof vi.fn>;
  findUltimaAtualizacao: ReturnType<typeof vi.fn>;
} {
  return {
    findResumoExecutivo: vi.fn(async () =>
      opts.resumo === undefined ? buildResumoRow() : opts.resumo,
    ),
    findTendenciasUltimos6Meses: vi.fn(async () =>
      opts.tendencias ?? [
        buildTendenciaRow('2025-12'),
        buildTendenciaRow('2026-01'),
        buildTendenciaRow('2026-02'),
        buildTendenciaRow('2026-03'),
        buildTendenciaRow('2026-04'),
        buildTendenciaRow('2026-05'),
      ],
    ),
    findUltimaAtualizacao: vi.fn(async () =>
      opts.meta === undefined
        ? {
            iniciadoEm: new Date('2026-05-05T03:00:00Z'),
            fonteRefreshUuid: 'meta-uuid-2',
          }
        : opts.meta,
    ),
  };
}

describe('GetDashboardExecutivoUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
  });

  it('agrega resumo + tendências + meta em uma resposta', async () => {
    const uc = new GetDashboardExecutivoUseCase(repo as never);
    const out = await uc.execute('2026-05');

    expect(repo.findResumoExecutivo).toHaveBeenCalledWith('2026-05');
    expect(repo.findTendenciasUltimos6Meses).toHaveBeenCalledWith('2026-05');
    expect(repo.findUltimaAtualizacao).toHaveBeenCalledWith(
      'mv_taxa_ocupacao_diaria',
    );

    expect(out.filtros.competencia).toBe('2026-05');
    expect(out.resumo).toMatchObject({
      competencia: '2026-05',
      pacientesAtendidos: 1200,
      cirurgiasRealizadas: 80,
      taxaOcupacaoPct: '78.50',
      iras: { totalCasos: 12, taxaPor1000PacienteDias: '4.80' },
      faturamento: {
        bruto: '1500000.0000',
        liquido: '1380000.0000',
        glosaPct: '5.20',
      },
      repasseTotal: '180000.0000',
    });
    expect(out.tendencias).toHaveLength(6);
    expect(out.tendencias[0].competencia).toBe('2025-12');
    expect(out.atualizacao.ultimaAtualizacaoUtc).toBe(
      '2026-05-05T03:00:00.000Z',
    );
    expect(out.atualizacao.fonteRefreshUuid).toBe('meta-uuid-2');
  });

  it('quando resumo é null: zera contadores e mantém meta', async () => {
    repo = buildRepo({ resumo: null, tendencias: [] });
    const uc = new GetDashboardExecutivoUseCase(repo as never);
    const out = await uc.execute('2026-05');

    expect(out.resumo.pacientesAtendidos).toBe(0);
    expect(out.resumo.cirurgiasRealizadas).toBe(0);
    expect(out.resumo.iras.totalCasos).toBe(0);
    expect(out.resumo.taxaOcupacaoPct).toBeNull();
    expect(out.resumo.faturamento.bruto).toBeNull();
    expect(out.tendencias).toEqual([]);
  });

  it('quando MV nunca atualizada: meta retorna null', async () => {
    repo = buildRepo({ meta: null });
    const uc = new GetDashboardExecutivoUseCase(repo as never);
    const out = await uc.execute('2026-05');

    expect(out.atualizacao.ultimaAtualizacaoUtc).toBeNull();
    expect(out.atualizacao.fonteRefreshUuid).toBeNull();
  });
});
