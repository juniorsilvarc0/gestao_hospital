/**
 * Allowlist das materialized views exportáveis via `POST /v1/bi/export`.
 *
 * SEGURANÇA — esta lista é a primeira barreira anti-SQL injection do
 * endpoint genérico de export. O `BiRepository.exportarMv` interpola
 * `viewName` e `colunas` literalmente em SQL — sem essa allowlist + a
 * validação regex do repo, qualquer string passaria.
 *
 * Adicionar nova view exige:
 *   1. Listar a view aqui com colunas e filtros suportados
 *   2. Garantir que a view tem `tenant_id` (multi-tenancy)
 *   3. Atualizar testes em `__tests__/views-allowlist.spec.ts`
 */

export type AllowedFilterType = 'string' | 'number' | 'date';

export interface AllowedView {
  /** Lista de colunas permitidas em export. Default: TODAS. */
  colunas: readonly string[];
  /**
   * Filtros aceitos. Mapeia a chave do payload do request para o tipo
   * esperado. O caller é responsável por converter (UUID → ID via
   * helpers do BiRepository); aqui aceitamos só os IDs já resolvidos.
   */
  filtros: Readonly<Record<string, AllowedFilterType>>;
}

export const ALLOWED_VIEWS: Readonly<Record<string, AllowedView>> = {
  mv_taxa_ocupacao_diaria: {
    colunas: [
      'dia',
      'setor_id',
      'setor_nome',
      'leitos_ocupados',
      'leitos_disponiveis',
      'leitos_reservados',
      'leitos_higienizacao',
      'leitos_manutencao',
      'leitos_bloqueados',
      'total_leitos',
      'taxa_ocupacao_pct',
    ],
    filtros: {
      dataInicio: 'date',
      dataFim: 'date',
      setorId: 'number',
    },
  },
  mv_permanencia_media_mensal: {
    colunas: [
      'competencia',
      'setor_id',
      'setor_nome',
      'qtd_internacoes',
      'permanencia_media_dias',
      'permanencia_mediana_dias',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      setorId: 'number',
    },
  },
  mv_mortalidade_mensal: {
    colunas: [
      'competencia',
      'setor_id',
      'setor_nome',
      'altas_total',
      'obitos',
      'taxa_mortalidade_pct',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      setorId: 'number',
    },
  },
  mv_iras_mensal: {
    colunas: [
      'competencia',
      'setor_id',
      'setor_nome',
      'casos_iras',
      'dias_paciente',
      'taxa_por_1000_paciente_dias',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      setorId: 'number',
    },
  },
  mv_faturamento_mensal: {
    colunas: [
      'competencia',
      'convenio_id',
      'convenio_nome',
      'qtd_contas',
      'valor_bruto',
      'valor_glosa',
      'valor_recurso',
      'valor_pago',
      'valor_liquido',
      'pct_glosa',
      'pct_recebido',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      convenioId: 'number',
    },
  },
  mv_glosas_mensal: {
    colunas: [
      'competencia',
      'convenio_id',
      'convenio_nome',
      'status',
      'qtd',
      'valor_glosado',
      'valor_revertido',
      'pct_reversao',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      convenioId: 'number',
      status: 'string',
    },
  },
  mv_repasse_mensal: {
    colunas: [
      'competencia',
      'prestador_id',
      'prestador_nome',
      'status',
      'valor_bruto',
      'valor_creditos',
      'valor_debitos',
      'valor_descontos',
      'valor_impostos',
      'valor_liquido',
      'pct_liquido_bruto',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      prestadorId: 'number',
    },
  },
  mv_no_show_mensal: {
    colunas: [
      'competencia',
      'recurso_id',
      'recurso_tipo',
      'recurso_nome',
      'total_agendamentos',
      'no_show',
      'realizados',
      'taxa_no_show_pct',
    ],
    filtros: {
      competenciaInicio: 'string',
      competenciaFim: 'string',
      recursoId: 'number',
    },
  },
  mv_classificacao_risco_diaria: {
    colunas: [
      'dia',
      'classe',
      'qtd',
      'tempo_ate_classificacao_min',
      'tempo_atendimento_apos_classif_min',
    ],
    filtros: {
      dataInicio: 'date',
      dataFim: 'date',
    },
  },
  mv_cirurgias_sala_diaria: {
    colunas: [
      'dia',
      'sala_id',
      'sala_nome',
      'qtd_agendadas',
      'qtd_concluidas',
      'qtd_canceladas',
      'duracao_media_min',
    ],
    filtros: {
      dataInicio: 'date',
      dataFim: 'date',
      salaId: 'number',
    },
  },
} as const;

/** Type-guard: garante que `name` é uma view permitida. */
export function isAllowedView(name: string): name is keyof typeof ALLOWED_VIEWS {
  return Object.prototype.hasOwnProperty.call(ALLOWED_VIEWS, name);
}

/** Filtra `colunas` mantendo só as permitidas; preserva ordem do caller. */
export function filterAllowedColumns(
  view: AllowedView,
  pedidas: readonly string[] | undefined,
): readonly string[] {
  if (pedidas === undefined || pedidas.length === 0) {
    return view.colunas;
  }
  return pedidas.filter((c) => view.colunas.includes(c));
}
