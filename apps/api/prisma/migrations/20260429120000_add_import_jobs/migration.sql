-- ═══════════════════════════════════════════════════════════════════════
-- add_import_jobs — Fase 3 / Trilha C
-- ═══════════════════════════════════════════════════════════════════════
-- Cria a tabela `import_jobs` para acompanhar importações assíncronas de
-- catálogos de procedimentos (TUSS, CBHPM, CID-10, CBO).
--
-- Convenções:
--   • RLS + FORCE habilitados.
--   • POLICY tenant_isolation lê current_setting('app.current_tenant_id').
--   • Trigger tg_audit chamada nos events INSERT/UPDATE/DELETE.
--   • UUID externo para identificação pública (`/jobs/:uuid`).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE import_jobs (
  id            BIGSERIAL PRIMARY KEY,
  uuid_externo  UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id     BIGINT NOT NULL,
  tipo          VARCHAR(40) NOT NULL,                              -- TUSS, CBHPM, CID10, CBO
  arquivo_nome  VARCHAR(300),
  arquivo_url   VARCHAR(500),
  status        VARCHAR(40) NOT NULL DEFAULT 'PENDENTE',           -- PENDENTE, EM_PROCESSAMENTO, CONCLUIDO, FALHOU
  total         INTEGER NOT NULL DEFAULT 0,
  processados   INTEGER NOT NULL DEFAULT 0,
  erros         INTEGER NOT NULL DEFAULT 0,
  error_log     JSONB,
  iniciado_em   TIMESTAMPTZ,
  concluido_em  TIMESTAMPTZ,
  iniciado_por  BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_import_jobs_tenant_id    FOREIGN KEY (tenant_id)    REFERENCES tenants(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_import_jobs_iniciado_por FOREIGN KEY (iniciado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT ck_import_jobs_tipo   CHECK (tipo   IN ('TUSS','CBHPM','CID10','CBO')),
  CONSTRAINT ck_import_jobs_status CHECK (status IN ('PENDENTE','EM_PROCESSAMENTO','CONCLUIDO','FALHOU'))
);

CREATE UNIQUE INDEX uq_import_jobs_uuid ON import_jobs (uuid_externo);
CREATE INDEX        ix_import_jobs_status ON import_jobs (tenant_id, status);
CREATE INDEX        ix_import_jobs_created_desc ON import_jobs (tenant_id, created_at DESC);

-- RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON import_jobs
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- Auditoria (trilha LGPD; mesma trigger usada nos demais cadastros).
CREATE TRIGGER tg_audit
  AFTER INSERT OR UPDATE OR DELETE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
