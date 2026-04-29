-- ─────────────────────────────────────────────────────────────────────
-- Fase 2 / P0 — Auditoria + RLS multi-tenant
--
-- Cria:
--   1. Tabela `auditoria_eventos` (PARTITION BY RANGE created_at) +
--      partições iniciais 2026-04, 2026-05, 2026-06.
--   2. Função `fn_audit_changes()` (DB.md §6.3) — escreve diff JSONB.
--   3. Trigger `tg_audit` aplicada a tenants, usuarios, perfis, sessoes_ativas.
--   4. Habilita RLS em `usuarios` e `perfis` (tabelas com tenant_id).
--      `tenants` é global (sem tenant_id próprio); RLS aplicado via app
--      no perfil ADMIN_GLOBAL (Fase 13). `sessoes_ativas` será reforçada
--      na Fase 3 (precisa de tenant_id denormalizado para policy direta).
--   5. POLICY tenant_isolation lê current_setting('app.current_tenant_id').
--
-- Rollback plan (se necessário, em nova migration):
--   ALTER TABLE … DISABLE ROW LEVEL SECURITY;
--   DROP POLICY tenant_isolation ON …;
--   DROP TRIGGER tg_audit ON …; DROP FUNCTION fn_audit_changes;
--   DROP TABLE auditoria_eventos CASCADE;
-- ─────────────────────────────────────────────────────────────────────

-- ─── 1. auditoria_eventos (PARTITIONED) ──────────────────────────────
CREATE TABLE auditoria_eventos (
  id              BIGSERIAL    NOT NULL,
  tenant_id       BIGINT,
  tabela          VARCHAR(120) NOT NULL,
  registro_id     BIGINT       NOT NULL,
  operacao        CHAR(1)      NOT NULL CHECK (operacao IN ('I','U','D','S')),
  diff            JSONB        NOT NULL,
  usuario_id      BIGINT,
  ip              INET,
  user_agent      TEXT,
  finalidade      VARCHAR(200),
  correlation_id  UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partições iniciais (job mensal cria as próximas).
CREATE TABLE auditoria_eventos_2026_04 PARTITION OF auditoria_eventos
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE auditoria_eventos_2026_05 PARTITION OF auditoria_eventos
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE auditoria_eventos_2026_06 PARTITION OF auditoria_eventos
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Índices canônicos (DB.md §6.1).
CREATE INDEX ix_audit_tenant_tabela_registro
  ON auditoria_eventos (tenant_id, tabela, registro_id);
CREATE INDEX ix_audit_usuario
  ON auditoria_eventos (usuario_id, created_at DESC);
CREATE INDEX ix_audit_correlation
  ON auditoria_eventos (correlation_id);

-- ─── 2. fn_audit_changes() ───────────────────────────────────────────
-- Escreve diff em auditoria_eventos. Lê context vars setadas pelo
-- TenantContextInterceptor (Trilha C):
--   app.current_tenant_id, app.current_user_id, app.current_correlation_id
CREATE OR REPLACE FUNCTION fn_audit_changes() RETURNS TRIGGER AS $$
DECLARE
  v_diff JSONB;
  v_op   CHAR(1);
  v_tenant_id BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op   := 'I';
    v_diff := jsonb_build_object('antes', NULL, 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detecção de soft-delete (deleted_at: NULL → NOT NULL).
    IF (to_jsonb(NEW) ? 'deleted_at')
       AND NEW.deleted_at IS NOT NULL
       AND OLD.deleted_at IS NULL THEN
      v_op := 'S';
    ELSE
      v_op := 'U';
    END IF;
    v_diff := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_op   := 'D';
    v_diff := jsonb_build_object('antes', to_jsonb(OLD), 'depois', NULL);
  END IF;

  -- tenant_id: lê do registro se a tabela tem; senão null (catálogos globais).
  v_tenant_id := NULL;
  IF (to_jsonb(COALESCE(NEW, OLD)) ? 'tenant_id') THEN
    v_tenant_id := (to_jsonb(COALESCE(NEW, OLD)) ->> 'tenant_id')::BIGINT;
  END IF;

  INSERT INTO auditoria_eventos (
    tenant_id, tabela, registro_id, operacao, diff,
    usuario_id, correlation_id
  ) VALUES (
    v_tenant_id,
    TG_TABLE_NAME,
    (to_jsonb(COALESCE(NEW, OLD)) ->> 'id')::BIGINT,
    v_op,
    v_diff,
    NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT,
    NULLIF(current_setting('app.current_correlation_id', TRUE), '')::UUID
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ─── 3. tg_audit em tenants, usuarios, perfis, sessoes_ativas ────────
CREATE TRIGGER tg_audit
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

CREATE TRIGGER tg_audit
  AFTER INSERT OR UPDATE OR DELETE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

CREATE TRIGGER tg_audit
  AFTER INSERT OR UPDATE OR DELETE ON perfis
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

CREATE TRIGGER tg_audit
  AFTER INSERT OR UPDATE OR DELETE ON sessoes_ativas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ─── 4. Row-Level Security em usuarios e perfis ──────────────────────
-- Por que não tenants/sessoes_ativas/permissoes:
--   • tenants  — registro global; ADMIN_GLOBAL controla via app (Fase 13).
--   • sessoes_ativas — sem tenant_id direto; precisa denormalizar (Fase 3).
--   • permissoes — catálogo global; sem tenant_id.
--
-- Importante: FORCE garante que mesmo o owner respeita a policy
-- (sem isso, role da app burlaria por ser owner do schema).

ALTER TABLE usuarios ENABLE  ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE   ROW LEVEL SECURITY;

ALTER TABLE perfis   ENABLE  ROW LEVEL SECURITY;
ALTER TABLE perfis   FORCE   ROW LEVEL SECURITY;

-- Policies: lê current_setting('app.current_tenant_id').
-- Sem o setting (string vazia ou ausente), nullif → NULL → cast falha →
-- nenhum registro retorna. Comportamento desejado (deny-by-default).

CREATE POLICY tenant_isolation ON usuarios
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

CREATE POLICY tenant_isolation ON perfis
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ─── 5. Bypass para seed/migrations ──────────────────────────────────
-- Migrations DDL não passam por RLS (DML only). Seed roda via prisma client
-- da app — DEVE chamar SET LOCAL antes de cada operação. O seed da Fase 1
-- já roda; vamos atualizá-lo na Trilha A para compatibilidade.
--
-- Para troubleshooting/reset manual via psql como superuser, RLS é
-- ignorado (superuser bypassa por padrão).
