-- ============================================================================
-- Fase 12 — BI, Dashboards, Indicadores
--
-- Estrutura:
--   - Schema `reporting` (separado de public)
--   - Tabela `reporting.refresh_log` (auditoria de refresh)
--   - Materialized views por área:
--       Assistenciais: ocupacao, permanencia, mortalidade, iras, reinternacao30d
--       Financeiras:   faturamento, glosas, repasse_ratio, recebimento
--       Operacionais:  no_show, classificacao_risco, dispensacoes_turno,
--                      cirurgias_sala
--   - Função `fn_refresh_all_materialized_views()` (idempotente)
--
-- Invariantes:
--   #1 Refresh é registrado em refresh_log (sucesso/falha + duração)
--   #2 Multi-tenant: todas as MVs filtram por tenant_id e expõem coluna
--      tenant_id para consumo pela aplicação (a aplicação re-filtra com
--      app.current_tenant_id no SELECT)
--   #3 RLS não se aplica a materialized views — aplicação DEVE filtrar
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Schema reporting + tabela de log
-- ═══════════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS reporting;

CREATE TABLE reporting.refresh_log (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT,                            -- NULL = refresh global
  view_name       VARCHAR(120) NOT NULL,
  iniciado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em    TIMESTAMPTZ,
  duracao_ms      INTEGER,
  status          VARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO',  -- EM_ANDAMENTO, OK, ERRO
  linhas          BIGINT,
  erro_mensagem   TEXT,
  trigger_origem  VARCHAR(40),                       -- CRON, MANUAL, EVENT
  triggered_by    BIGINT                             -- usuario.id quando MANUAL
);

CREATE INDEX ix_refresh_log_view_data ON reporting.refresh_log (view_name, iniciado_em DESC);
CREATE INDEX ix_refresh_log_status    ON reporting.refresh_log (status, iniciado_em DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. MV Assistencial — taxa de ocupação por dia/setor
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_taxa_ocupacao_diaria AS
SELECT
  l.tenant_id,
  date_trunc('day', now())::date  AS dia,
  s.id                              AS setor_id,
  s.nome                            AS setor_nome,
  COUNT(*) FILTER (WHERE l.status = 'OCUPADO')        AS leitos_ocupados,
  COUNT(*) FILTER (WHERE l.status = 'DISPONIVEL')     AS leitos_disponiveis,
  COUNT(*) FILTER (WHERE l.status = 'RESERVADO')      AS leitos_reservados,
  COUNT(*) FILTER (WHERE l.status = 'HIGIENIZACAO')   AS leitos_higienizacao,
  COUNT(*) FILTER (WHERE l.status = 'MANUTENCAO')     AS leitos_manutencao,
  COUNT(*) FILTER (WHERE l.status = 'BLOQUEADO')      AS leitos_bloqueados,
  COUNT(*)                                            AS total_leitos,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE l.status = 'OCUPADO')
    / NULLIF(COUNT(*) FILTER (WHERE l.status IN ('OCUPADO','DISPONIVEL','HIGIENIZACAO')), 0),
    2
  ) AS taxa_ocupacao_pct
FROM leitos l
JOIN setores s ON s.id = l.setor_id
WHERE l.deleted_at IS NULL
GROUP BY l.tenant_id, s.id, s.nome
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_taxa_ocupacao ON reporting.mv_taxa_ocupacao_diaria (tenant_id, dia, setor_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. MV Assistencial — permanência média (mensal por setor)
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_permanencia_media_mensal AS
SELECT
  a.tenant_id,
  to_char(a.data_hora_saida, 'YYYY-MM')  AS competencia,
  a.setor_id,
  s.nome                                  AS setor_nome,
  COUNT(*)                                AS qtd_internacoes,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (a.data_hora_saida - a.data_hora_entrada)) / 86400.0)::numeric,
    2
  ) AS permanencia_media_dias,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (a.data_hora_saida - a.data_hora_entrada)) / 86400.0
  )::numeric(10,2) AS permanencia_mediana_dias
FROM atendimentos a
JOIN setores s ON s.id = a.setor_id
WHERE a.tipo = 'INTERNACAO'
  AND a.data_hora_saida IS NOT NULL
  AND a.data_hora_saida > a.data_hora_entrada
  AND a.deleted_at IS NULL
GROUP BY a.tenant_id, to_char(a.data_hora_saida, 'YYYY-MM'), a.setor_id, s.nome
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_permanencia ON reporting.mv_permanencia_media_mensal (tenant_id, competencia, setor_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. MV Assistencial — mortalidade (mensal por setor)
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_mortalidade_mensal AS
SELECT
  a.tenant_id,
  to_char(a.data_hora_saida, 'YYYY-MM')   AS competencia,
  a.setor_id,
  s.nome                                   AS setor_nome,
  COUNT(*) FILTER (WHERE a.tipo_alta IS NOT NULL)               AS altas_total,
  COUNT(*) FILTER (WHERE a.tipo_alta = 'OBITO')                 AS obitos,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE a.tipo_alta = 'OBITO')
    / NULLIF(COUNT(*) FILTER (WHERE a.tipo_alta IS NOT NULL), 0),
    2
  ) AS taxa_mortalidade_pct
FROM atendimentos a
JOIN setores s ON s.id = a.setor_id
WHERE a.data_hora_saida IS NOT NULL
  AND a.deleted_at IS NULL
GROUP BY a.tenant_id, to_char(a.data_hora_saida, 'YYYY-MM'), a.setor_id, s.nome
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_mortalidade ON reporting.mv_mortalidade_mensal (tenant_id, competencia, setor_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. MV Assistencial — IRAS (CCIH) por setor/competência
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_iras_mensal AS
WITH paciente_dias AS (
  SELECT
    a.tenant_id,
    to_char(COALESCE(a.data_hora_saida, now()), 'YYYY-MM') AS competencia,
    a.setor_id,
    SUM(
      EXTRACT(EPOCH FROM (COALESCE(a.data_hora_saida, now()) - a.data_hora_entrada))
      / 86400.0
    )::numeric AS dias_paciente
  FROM atendimentos a
  WHERE a.tipo = 'INTERNACAO'
    AND a.deleted_at IS NULL
  GROUP BY a.tenant_id, to_char(COALESCE(a.data_hora_saida, now()), 'YYYY-MM'), a.setor_id
)
SELECT
  c.tenant_id,
  to_char(c.data_diagnostico, 'YYYY-MM')  AS competencia,
  c.setor_id,
  s.nome                                   AS setor_nome,
  COUNT(*)                                 AS casos_iras,
  COALESCE(pd.dias_paciente, 0)            AS dias_paciente,
  CASE
    WHEN COALESCE(pd.dias_paciente, 0) > 0
    THEN ROUND(1000.0 * COUNT(*) / pd.dias_paciente, 2)
    ELSE NULL
  END                                      AS taxa_por_1000_paciente_dias
FROM ccih_casos c
JOIN setores s ON s.id = c.setor_id
LEFT JOIN paciente_dias pd
  ON pd.tenant_id = c.tenant_id
  AND pd.competencia = to_char(c.data_diagnostico, 'YYYY-MM')
  AND pd.setor_id = c.setor_id
WHERE c.deleted_at IS NULL
GROUP BY
  c.tenant_id,
  to_char(c.data_diagnostico, 'YYYY-MM'),
  c.setor_id,
  s.nome,
  pd.dias_paciente
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_iras ON reporting.mv_iras_mensal (tenant_id, competencia, setor_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. MV Financeiro — faturamento por convênio/competência
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_faturamento_mensal AS
SELECT
  c.tenant_id,
  to_char(c.data_fechamento, 'YYYY-MM')  AS competencia,
  c.convenio_id,
  cv.nome                                 AS convenio_nome,
  COUNT(*)                                AS qtd_contas,
  SUM(c.valor_total)                      AS valor_bruto,
  SUM(c.valor_glosa)                      AS valor_glosa,
  SUM(c.valor_recurso_revertido)          AS valor_recurso,
  SUM(c.valor_pago)                       AS valor_pago,
  SUM(c.valor_liquido)                    AS valor_liquido,
  ROUND(
    100.0 * SUM(c.valor_glosa)
    / NULLIF(SUM(c.valor_total), 0),
    2
  ) AS pct_glosa,
  ROUND(
    100.0 * SUM(c.valor_pago)
    / NULLIF(SUM(c.valor_total), 0),
    2
  ) AS pct_recebido
FROM contas c
LEFT JOIN convenios cv ON cv.id = c.convenio_id
WHERE c.data_fechamento IS NOT NULL
  AND c.deleted_at IS NULL
  AND c.status NOT IN ('CANCELADA')
GROUP BY c.tenant_id, to_char(c.data_fechamento, 'YYYY-MM'), c.convenio_id, cv.nome
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_faturamento ON reporting.mv_faturamento_mensal (
  tenant_id,
  competencia,
  COALESCE(convenio_id, 0)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. MV Financeiro — glosas (mensal por convênio + status)
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_glosas_mensal AS
SELECT
  g.tenant_id,
  to_char(g.data_glosa, 'YYYY-MM')        AS competencia,
  g.convenio_id,
  cv.nome                                  AS convenio_nome,
  g.status::text                           AS status,
  COUNT(*)                                 AS qtd,
  SUM(g.valor_glosado)                     AS valor_glosado,
  SUM(g.valor_revertido)                   AS valor_revertido,
  ROUND(
    100.0 * SUM(g.valor_revertido)
    / NULLIF(SUM(g.valor_glosado), 0),
    2
  ) AS pct_reversao
FROM glosas g
LEFT JOIN convenios cv ON cv.id = g.convenio_id
GROUP BY g.tenant_id, to_char(g.data_glosa, 'YYYY-MM'), g.convenio_id, cv.nome, g.status
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_glosas ON reporting.mv_glosas_mensal (
  tenant_id, competencia, COALESCE(convenio_id, 0), status
);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. MV Financeiro — repasse mensal por prestador
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_repasse_mensal AS
SELECT
  r.tenant_id,
  r.competencia,
  r.prestador_id,
  p.nome                  AS prestador_nome,
  r.status::text           AS status,
  r.valor_bruto,
  r.valor_creditos,
  r.valor_debitos,
  r.valor_descontos,
  r.valor_impostos,
  r.valor_liquido,
  ROUND(
    100.0 * r.valor_liquido / NULLIF(r.valor_bruto, 0),
    2
  ) AS pct_liquido_bruto
FROM repasses r
JOIN prestadores p ON p.id = r.prestador_id
WHERE p.deleted_at IS NULL
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_repasse ON reporting.mv_repasse_mensal (tenant_id, competencia, prestador_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. MV Operacional — no-show (consultas que não compareceram)
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_no_show_mensal AS
SELECT
  ag.tenant_id,
  to_char(ag.inicio, 'YYYY-MM')                     AS competencia,
  ag.recurso_id,
  r.tipo::text                                       AS recurso_tipo,
  COALESCE(p.nome, sc.nome, eq.nome, 'Recurso ' || r.id::text) AS recurso_nome,
  COUNT(*)                                          AS total_agendamentos,
  COUNT(*) FILTER (WHERE ag.status = 'FALTOU')                  AS no_show,
  COUNT(*) FILTER (WHERE ag.status = 'COMPARECEU')              AS realizados,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ag.status = 'FALTOU')
    / NULLIF(COUNT(*) FILTER (WHERE ag.status IN ('FALTOU','COMPARECEU')), 0),
    2
  ) AS taxa_no_show_pct
FROM agendamentos ag
JOIN agendas_recursos r ON r.id = ag.recurso_id
LEFT JOIN prestadores p     ON p.id  = r.prestador_id
LEFT JOIN salas_cirurgicas sc ON sc.id = r.sala_id
LEFT JOIN equipamentos eq   ON eq.id = r.equipamento_id
WHERE ag.inicio IS NOT NULL
GROUP BY ag.tenant_id, to_char(ag.inicio, 'YYYY-MM'), ag.recurso_id, r.tipo, p.nome, sc.nome, eq.nome, r.id
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_no_show ON reporting.mv_no_show_mensal (tenant_id, competencia, recurso_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. MV Operacional — classificação de risco (Manchester) por dia
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_classificacao_risco_diaria AS
SELECT
  a.tenant_id,
  date_trunc('day', a.classificacao_risco_em)::date  AS dia,
  a.classificacao_risco::text                         AS classe,
  COUNT(*)                                            AS qtd,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (a.classificacao_risco_em - a.data_hora_entrada)) / 60.0)::numeric,
    2
  ) AS tempo_ate_classificacao_min,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (
      COALESCE(a.data_hora_saida, now()) - a.classificacao_risco_em
    )) / 60.0)::numeric,
    2
  ) AS tempo_atendimento_apos_classif_min
FROM atendimentos a
WHERE a.classificacao_risco IS NOT NULL
  AND a.classificacao_risco_em IS NOT NULL
  AND a.deleted_at IS NULL
GROUP BY a.tenant_id, date_trunc('day', a.classificacao_risco_em)::date, a.classificacao_risco
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_classif_risco ON reporting.mv_classificacao_risco_diaria (tenant_id, dia, classe);

-- ═══════════════════════════════════════════════════════════════════════
-- 11. MV Operacional — cirurgias por sala/dia
-- ═══════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW reporting.mv_cirurgias_sala_diaria AS
SELECT
  c.tenant_id,
  date_trunc('day', c.data_hora_agendada)::date  AS dia,
  c.sala_id,
  s.nome                                          AS sala_nome,
  COUNT(*)                                        AS qtd_agendadas,
  COUNT(*) FILTER (WHERE c.status = 'CONCLUIDA')   AS qtd_concluidas,
  COUNT(*) FILTER (WHERE c.status = 'CANCELADA')   AS qtd_canceladas,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (c.data_hora_fim - c.data_hora_inicio)) / 60.0)
      FILTER (WHERE c.status = 'CONCLUIDA' AND c.data_hora_fim IS NOT NULL)::numeric,
    2
  ) AS duracao_media_min
FROM cirurgias c
JOIN salas_cirurgicas s ON s.id = c.sala_id
WHERE c.deleted_at IS NULL
GROUP BY c.tenant_id, date_trunc('day', c.data_hora_agendada)::date, c.sala_id, s.nome
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_cirurgias_sala ON reporting.mv_cirurgias_sala_diaria (tenant_id, dia, sala_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 12. Função fn_refresh_all_materialized_views
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reporting.fn_refresh_all() RETURNS TABLE (
  view_name TEXT, status TEXT, duracao_ms INTEGER, linhas BIGINT, erro TEXT
) AS $$
DECLARE
  views TEXT[] := ARRAY[
    'mv_taxa_ocupacao_diaria',
    'mv_permanencia_media_mensal',
    'mv_mortalidade_mensal',
    'mv_iras_mensal',
    'mv_faturamento_mensal',
    'mv_glosas_mensal',
    'mv_repasse_mensal',
    'mv_no_show_mensal',
    'mv_classificacao_risco_diaria',
    'mv_cirurgias_sala_diaria'
  ];
  v   TEXT;
  ini TIMESTAMPTZ;
  fim TIMESTAMPTZ;
  cnt BIGINT;
  log_id BIGINT;
BEGIN
  FOREACH v IN ARRAY views LOOP
    INSERT INTO reporting.refresh_log (view_name, trigger_origem)
    VALUES (v, 'MANUAL') RETURNING id INTO log_id;

    ini := clock_timestamp();
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY reporting.%I', v);
      fim := clock_timestamp();
      EXECUTE format('SELECT COUNT(*) FROM reporting.%I', v) INTO cnt;
      UPDATE reporting.refresh_log SET
        concluido_em = fim,
        duracao_ms   = EXTRACT(MILLISECOND FROM (fim - ini))::int + EXTRACT(SECOND FROM (fim - ini))::int * 1000,
        status       = 'OK',
        linhas       = cnt
      WHERE id = log_id;

      view_name  := v;
      status     := 'OK';
      duracao_ms := EXTRACT(MILLISECOND FROM (fim - ini))::int + EXTRACT(SECOND FROM (fim - ini))::int * 1000;
      linhas     := cnt;
      erro       := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      fim := clock_timestamp();
      UPDATE reporting.refresh_log SET
        concluido_em = fim,
        duracao_ms   = EXTRACT(MILLISECOND FROM (fim - ini))::int + EXTRACT(SECOND FROM (fim - ini))::int * 1000,
        status       = 'ERRO',
        erro_mensagem = SQLERRM
      WHERE id = log_id;

      view_name  := v;
      status     := 'ERRO';
      duracao_ms := EXTRACT(MILLISECOND FROM (fim - ini))::int + EXTRACT(SECOND FROM (fim - ini))::int * 1000;
      linhas     := NULL;
      erro       := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Função para refresh inicial (antes do CONCURRENTLY funcionar — exige primeira população)
CREATE OR REPLACE FUNCTION reporting.fn_refresh_initial() RETURNS VOID AS $$
DECLARE
  views TEXT[] := ARRAY[
    'mv_taxa_ocupacao_diaria',
    'mv_permanencia_media_mensal',
    'mv_mortalidade_mensal',
    'mv_iras_mensal',
    'mv_faturamento_mensal',
    'mv_glosas_mensal',
    'mv_repasse_mensal',
    'mv_no_show_mensal',
    'mv_classificacao_risco_diaria',
    'mv_cirurgias_sala_diaria'
  ];
  v TEXT;
BEGIN
  FOREACH v IN ARRAY views LOOP
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW reporting.%I', v);
    EXCEPTION WHEN OTHERS THEN
      -- Ignora — refresh inicial é best-effort (pode falhar por colunas faltantes em ambientes vazios)
      RAISE NOTICE 'fn_refresh_initial: skip % (%)', v, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Refresh inicial (popular as MVs criadas) — necessário para CONCURRENTLY funcionar depois.
SELECT reporting.fn_refresh_initial();

-- ═══════════════════════════════════════════════════════════════════════
-- 13. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('bi',                     'read',          'Acessar dashboards e indicadores'),
  ('bi',                     'export',        'Exportar CSV/Excel'),
  ('bi',                     'refresh',       'Disparar refresh manual de MVs'),
  ('bi',                     'admin',         'Administrar BI (refresh log)'),
  ('dashboard_executivo',    'read',          'Dashboard executivo (KPIs alto nível)'),
  ('dashboard_operacional',  'read',          'Dashboard operacional (mapa, fila, salas)'),
  ('indicadores_assistencial','read',          'Indicadores assistenciais'),
  ('indicadores_financeiro', 'read',          'Indicadores financeiros'),
  ('indicadores_operacional','read',          'Indicadores operacionais')
ON CONFLICT (recurso, acao) DO NOTHING;

DO $$
DECLARE current_t BIGINT;
BEGIN
  FOR current_t IN SELECT id FROM tenants WHERE ativo LOOP
    PERFORM set_config('app.current_tenant_id', current_t::text, TRUE);

    -- ADMIN tudo
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ADMIN'
       AND perm.recurso IN ('bi','dashboard_executivo','dashboard_operacional',
                            'indicadores_assistencial','indicadores_financeiro','indicadores_operacional')
    ON CONFLICT DO NOTHING;

    -- FATURISTA: financeiro + bi:read/export
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='FATURISTA'
       AND ((perm.recurso='bi' AND perm.acao IN ('read','export'))
         OR (perm.recurso='indicadores_financeiro' AND perm.acao='read')
         OR (perm.recurso='dashboard_executivo' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;

    -- ENFERMEIRO: assistencial + operacional
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ENFERMEIRO'
       AND ((perm.recurso='bi' AND perm.acao='read')
         OR (perm.recurso='indicadores_assistencial' AND perm.acao='read')
         OR (perm.recurso='indicadores_operacional' AND perm.acao='read')
         OR (perm.recurso='dashboard_operacional' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;

    -- MEDICO: assistencial
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='bi' AND perm.acao='read')
         OR (perm.recurso='indicadores_assistencial' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
