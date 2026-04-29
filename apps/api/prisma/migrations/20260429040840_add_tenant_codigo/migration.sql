-- ─────────────────────────────────────────────────────────────────────
-- Fase 2 / Auth — Adiciona `codigo` em `tenants`.
--
-- Motivo: o login do HMS-BR aceita `tenantCode` no payload (ex.: 'dev')
-- para resolver o tenant ANTES de aplicar `SET LOCAL app.current_tenant_id`.
-- Sem `codigo`, o cliente teria que passar BIGINT do tenant — quebra UX
-- e expõe IDs internos. CNPJ é PII e não cabe no formulário de login.
--
-- Estratégia idempotente:
--   1. Adiciona coluna como NULLABLE.
--   2. Backfill do tenant existente (codigo = 'dev', conforme seed Fase 1
--      que já gravava `configuracoes.codigo = 'dev'`).
--   3. NOT NULL + UNIQUE + index.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tenants ADD COLUMN codigo VARCHAR(20);

-- Backfill: tenant `dev` existe pelo seed da Fase 1.
UPDATE tenants SET codigo = 'dev' WHERE id = 1 AND codigo IS NULL;

-- Para qualquer outro tenant pré-existente, gera código provisório a
-- partir do id (segurança extra; em prática só há 1 tenant em dev).
UPDATE tenants SET codigo = 'tenant-' || id::text WHERE codigo IS NULL;

ALTER TABLE tenants ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE tenants ADD CONSTRAINT uq_tenants_codigo UNIQUE (codigo);
CREATE INDEX ix_tenants_codigo ON tenants (codigo);
