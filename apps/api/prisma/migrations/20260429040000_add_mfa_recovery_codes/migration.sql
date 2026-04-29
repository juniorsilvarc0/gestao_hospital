-- ─────────────────────────────────────────────────────────────────────
-- Fase 2 / Trilha B — MFA Recovery Codes
--
-- Cria a tabela `mfa_recovery_codes` para guardar códigos de recuperação
-- (one-time use) hashed com Argon2id. Cada código consumido marca
-- `used_at = now()` e não pode ser reutilizado.
--
-- Multi-tenant: linha pertence ao tenant do usuário e RLS aplica
-- isolamento via `app.current_tenant_id` (SET LOCAL pela Trilha A/C).
--
-- Auditoria: o trigger `tg_audit` da migration 20260429035759_audit_rls
-- não é aplicada aqui porque o conteúdo (`code_hash`) não tem valor
-- forense por si só; eventos `mfa.*` em `auditoria_eventos` registram
-- enable/disable/recovery_used. Se Compliance pedir, basta:
--   CREATE TRIGGER tg_audit BEFORE INSERT OR UPDATE OR DELETE
--   ON mfa_recovery_codes FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE mfa_recovery_codes (
  id          BIGSERIAL    PRIMARY KEY,
  tenant_id   BIGINT       NOT NULL,
  usuario_id  BIGINT       NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT fk_mfa_recovery_codes_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mfa_recovery_codes_usuario_id
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índice parcial: apenas códigos ainda não usados são candidatos a match.
CREATE INDEX ix_mfa_rc_usuario
  ON mfa_recovery_codes (usuario_id)
  WHERE used_at IS NULL;

-- Índice de tenant (FK indexada — exigido pelo padrão multi-tenant).
CREATE INDEX ix_mfa_rc_tenant
  ON mfa_recovery_codes (tenant_id);

-- ─── RLS multi-tenant ────────────────────────────────────────────────
ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON mfa_recovery_codes
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT
  );
