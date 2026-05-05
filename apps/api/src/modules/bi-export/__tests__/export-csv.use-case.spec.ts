/**
 * Testes unitários do `ExportCsvUseCase`.
 *
 * Cobertura:
 *   - View fora da allowlist → BadRequestException (não chega ao repo).
 *   - Colunas pedidas inválidas filtradas; tudo inválido → erro.
 *   - UUID inexistente → CSV header-only (não vaza dados de outro tenant).
 *   - Formato CSV: BOM + separador `;` + CRLF + escape de aspas/vírgulas.
 *   - O caller NÃO controla `tenant_id` — quem garante é o repo (mockado
 *     aqui apenas para verificar que o use case não tenta sobrescrevê-lo).
 */
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportCsvUseCase } from '../application/export-csv.use-case';

function buildRepo(opts: {
  exportRows?: Record<string, unknown>[];
  convenioId?: bigint | null;
} = {}): {
  exportarMv: ReturnType<typeof vi.fn>;
  findConvenioIdByUuid: ReturnType<typeof vi.fn>;
  findPrestadorIdByUuid: ReturnType<typeof vi.fn>;
  findRecursoIdByUuid: ReturnType<typeof vi.fn>;
  findSalaCirurgicaIdByUuid: ReturnType<typeof vi.fn>;
  findSetorIdByUuid: ReturnType<typeof vi.fn>;
} {
  return {
    exportarMv: vi.fn(async () => opts.exportRows ?? []),
    findConvenioIdByUuid: vi.fn(async () =>
      opts.convenioId === undefined ? 5n : opts.convenioId,
    ),
    findPrestadorIdByUuid: vi.fn(async () => null),
    findRecursoIdByUuid: vi.fn(async () => null),
    findSalaCirurgicaIdByUuid: vi.fn(async () => null),
    findSetorIdByUuid: vi.fn(async () => null),
  };
}

describe('ExportCsvUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;

  beforeEach(() => {
    repo = buildRepo();
  });

  it('rejeita view fora da allowlist sem chamar repo', async () => {
    const uc = new ExportCsvUseCase(repo as never);
    await expect(
      uc.execute({
        viewName: 'usuarios', // tabela real → mas NÃO está na allowlist
        body: { filtros: {} as never },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.exportarMv).not.toHaveBeenCalled();
  });

  it('rejeita SQL injection em viewName', async () => {
    const uc = new ExportCsvUseCase(repo as never);
    await expect(
      uc.execute({
        viewName: 'mv_faturamento_mensal; DROP TABLE pacientes',
        body: { filtros: {} as never },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.exportarMv).not.toHaveBeenCalled();
  });

  it('happy path CSV: BOM + separador ; + CRLF + header bold-friendly', async () => {
    repo = buildRepo({
      exportRows: [
        { competencia: '2026-04', valor_bruto: '500000.00' },
        { competencia: '2026-04', valor_bruto: '120000.00' },
      ],
    });
    const uc = new ExportCsvUseCase(repo as never);
    const out = await uc.execute({
      viewName: 'mv_faturamento_mensal',
      body: {
        filtros: { competenciaInicio: '2026-04', competenciaFim: '2026-04' } as never,
        colunas: ['competencia', 'valor_bruto'],
      },
    });

    expect(out.contentType).toBe('text/csv; charset=utf-8');
    expect(out.filename).toBe('mv_faturamento_mensal.csv');
    const text = out.body.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(text).toContain('competencia;valor_bruto\r\n');
    expect(text).toContain('2026-04;500000.00\r\n');
  });

  it('escapa células com separador ; ou aspas', async () => {
    repo = buildRepo({
      exportRows: [
        { convenio_nome: 'Plano "Top"', status: 'a;b' },
      ],
    });
    const uc = new ExportCsvUseCase(repo as never);
    const out = await uc.execute({
      viewName: 'mv_glosas_mensal',
      body: {
        filtros: { competenciaInicio: '2026-04', competenciaFim: '2026-04' } as never,
        colunas: ['convenio_nome', 'status'],
      },
    });
    const text = out.body.toString('utf8');
    expect(text).toContain('"Plano ""Top""";');
    expect(text).toContain(';"a;b"');
  });

  it('UUID inexistente → CSV vazio (header only), repo.exportarMv NÃO chamado', async () => {
    repo = buildRepo({ convenioId: null });
    const uc = new ExportCsvUseCase(repo as never);
    const out = await uc.execute({
      viewName: 'mv_faturamento_mensal',
      body: {
        filtros: {
          competenciaInicio: '2026-04',
          competenciaFim: '2026-04',
          convenioUuid: '00000000-0000-4000-8000-000000000099',
        } as never,
      },
    });
    const text = out.body.toString('utf8');
    // Apenas header (sem CRLF final porque não há rows).
    expect(text).toContain('competencia');
    expect(repo.exportarMv).not.toHaveBeenCalled();
  });

  it('rejeita quando todas as colunas pedidas são inválidas', async () => {
    const uc = new ExportCsvUseCase(repo as never);
    await expect(
      uc.execute({
        viewName: 'mv_faturamento_mensal',
        body: {
          filtros: {} as never,
          colunas: ['inexistente_a', 'inexistente_b'],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('caller NÃO consegue passar tenant_id custom (campo ignorado pelo DTO)', async () => {
    const uc = new ExportCsvUseCase(repo as never);
    await uc.execute({
      viewName: 'mv_faturamento_mensal',
      body: {
        // O DTO ExportFiltrosDto não tem `tenantId`, então é silenciosamente
        // descartado. Essa é a barreira no boundary HTTP. A barreira no
        // repo (`requireTenantId()`) é o complemento.
        filtros: {
          competenciaInicio: '2026-04',
          competenciaFim: '2026-04',
          // @ts-expect-error — purposely sending a forbidden field
          tenantId: 9999,
        } as never,
      },
    });
    // `exportarMv` foi chamado — vamos garantir que `tenantId` NÃO foi
    // propagado nos filtros (o repo aplica o do contexto via
    // requireTenantId()).
    expect(repo.exportarMv).toHaveBeenCalledTimes(1);
    const call = repo.exportarMv.mock.calls[0][0] as {
      filtros: Record<string, unknown>;
    };
    expect(call.filtros).not.toHaveProperty('tenantId');
    expect(call.filtros).not.toHaveProperty('tenant_id');
  });
});
