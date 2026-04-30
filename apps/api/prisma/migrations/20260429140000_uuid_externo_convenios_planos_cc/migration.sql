-- ─────────────────────────────────────────────────────────────────────
-- Fase 3 / Trilha B — Adiciona uuid_externo a convenios, planos e
-- condicoes_contratuais.
--
-- CLAUDE.md §1.2 exige que identificadores expostos pela API sejam UUID
-- (nunca BIGINT). A migração `cadastros_base` deixou apenas `prestadores`
-- com `uuid_externo`; aqui completamos as 3 tabelas restantes do escopo
-- da Trilha B sem recriar índices/constraints existentes.
--
-- Estratégia:
--   • ADD COLUMN ... DEFAULT uuid_generate_v4() popula linhas existentes.
--     Após o popular, a coluna fica NOT NULL com default. Nenhum dado
--     em produção neste momento (Fase 3 inicial) — operação O(1) em dev.
--   • UNIQUE INDEX por tenant para suportar lookup eficiente.
--
-- Idempotência: `ADD COLUMN IF NOT EXISTS` para permitir re-run em dev.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE convenios
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();

ALTER TABLE planos
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();

ALTER TABLE condicoes_contratuais
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();

-- Índices únicos (lookup por uuid externo na API).
CREATE UNIQUE INDEX IF NOT EXISTS uq_convenios_uuid_externo
  ON convenios (uuid_externo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planos_uuid_externo
  ON planos (uuid_externo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_condicoes_contratuais_uuid_externo
  ON condicoes_contratuais (uuid_externo);

-- Inclui também `prestadores.uuid_externo`, que foi declarado em
-- `cadastros_base` mas não recebeu UNIQUE INDEX. Necessário para
-- lookup via API (`GET /v1/prestadores/:uuid`).
CREATE UNIQUE INDEX IF NOT EXISTS uq_prestadores_uuid_externo
  ON prestadores (uuid_externo);
