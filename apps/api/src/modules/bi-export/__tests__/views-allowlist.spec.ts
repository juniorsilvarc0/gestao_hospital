/**
 * Testes da allowlist de views exportáveis.
 *
 * Estes testes garantem que:
 *   1. As 10 MVs do schema `reporting` estão listadas (cobertura completa).
 *   2. Toda coluna listada respeita o regex permitido pelo `BiRepository`
 *      (`/^[a-z][a-z0-9_]*$/`) — defesa em profundidade.
 *   3. `isAllowedView` rejeita views fora da lista.
 *   4. `filterAllowedColumns` retorna intersection (não rejeita).
 *
 * NÃO há teste de tenant_id aqui — esse é responsabilidade do
 * `BiRepository.exportarMv` (testes de integração via testcontainers).
 */
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_VIEWS,
  filterAllowedColumns,
  isAllowedView,
} from '../application/views-allowlist';

const ID_REGEX = /^[a-z][a-z0-9_]*$/;

describe('ALLOWED_VIEWS', () => {
  it('cobre as 10 MVs do schema reporting', () => {
    const expected = [
      'mv_taxa_ocupacao_diaria',
      'mv_permanencia_media_mensal',
      'mv_mortalidade_mensal',
      'mv_iras_mensal',
      'mv_faturamento_mensal',
      'mv_glosas_mensal',
      'mv_repasse_mensal',
      'mv_no_show_mensal',
      'mv_classificacao_risco_diaria',
      'mv_cirurgias_sala_diaria',
    ];
    expect(Object.keys(ALLOWED_VIEWS).sort()).toEqual(expected.sort());
  });

  it('todas as colunas listadas respeitam o regex de identificadores SQL', () => {
    for (const [view, def] of Object.entries(ALLOWED_VIEWS)) {
      expect(ID_REGEX.test(view), `view inválida: ${view}`).toBe(true);
      for (const c of def.colunas) {
        expect(ID_REGEX.test(c), `coluna inválida em ${view}: ${c}`).toBe(true);
      }
    }
  });

  it('todas as views têm pelo menos 1 coluna', () => {
    for (const [view, def] of Object.entries(ALLOWED_VIEWS)) {
      expect(def.colunas.length, `${view} sem colunas`).toBeGreaterThan(0);
    }
  });
});

describe('isAllowedView', () => {
  it('aceita view permitida', () => {
    expect(isAllowedView('mv_faturamento_mensal')).toBe(true);
  });

  it('rejeita view fora da lista', () => {
    expect(isAllowedView('usuarios')).toBe(false);
    expect(isAllowedView('pg_catalog.pg_tables')).toBe(false);
    expect(isAllowedView('mv_faturamento_mensal; DROP TABLE')).toBe(false);
  });
});

describe('filterAllowedColumns', () => {
  const view = ALLOWED_VIEWS.mv_faturamento_mensal;

  it('sem colunas pedidas: devolve todas as permitidas', () => {
    const out = filterAllowedColumns(view, undefined);
    expect(out).toEqual(view.colunas);
  });

  it('lista vazia: devolve todas (mesmo comportamento)', () => {
    const out = filterAllowedColumns(view, []);
    expect(out).toEqual(view.colunas);
  });

  it('intersection: mantém só as permitidas, descarta outras', () => {
    const out = filterAllowedColumns(view, [
      'competencia',
      'valor_bruto',
      'INVENTADA',
      'tabela_secreta',
    ]);
    expect(out).toEqual(['competencia', 'valor_bruto']);
  });

  it('preserva ordem do caller', () => {
    const out = filterAllowedColumns(view, ['valor_bruto', 'competencia']);
    expect(out).toEqual(['valor_bruto', 'competencia']);
  });
});
