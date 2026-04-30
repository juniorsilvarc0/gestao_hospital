-- Fase 3 / Trilha A — solicitacoes_lgpd (LGPD Art.18 — direitos do titular).
-- Migration extraída do estado real do banco em 2026-04-29 (Trilha A criou
-- a tabela via db push antes do limit). Arquivada para fresh deploys.

CREATE TYPE enum_lgpd_solicitacao_tipo AS ENUM (
  'ACESSO', 'EXCLUSAO', 'PORTABILIDADE', 'CORRECAO', 'REVOGACAO_CONSENTIMENTO'
);

CREATE TYPE enum_lgpd_solicitacao_status AS ENUM (
  'PENDENTE', 'EM_ANALISE', 'ATENDIDA', 'NEGADA'
);

CREATE TABLE solicitacoes_lgpd (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  tipo            enum_lgpd_solicitacao_tipo NOT NULL,
  motivo          TEXT,
  status          enum_lgpd_solicitacao_status NOT NULL DEFAULT 'PENDENTE',
  prazo_sla_dias  INTEGER NOT NULL DEFAULT 15,
  solicitada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  solicitante_id  BIGINT,
  atendida_em     TIMESTAMPTZ,
  atendida_por    BIGINT,
  resposta        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX ix_solicitacoes_lgpd_paciente ON solicitacoes_lgpd (paciente_id, solicitada_em DESC);
CREATE INDEX ix_solicitacoes_lgpd_status   ON solicitacoes_lgpd (tenant_id, status);
CREATE UNIQUE INDEX uq_solicitacoes_lgpd_uuid ON solicitacoes_lgpd (uuid_externo);

ALTER TABLE solicitacoes_lgpd ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_lgpd FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON solicitacoes_lgpd
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON solicitacoes_lgpd
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
