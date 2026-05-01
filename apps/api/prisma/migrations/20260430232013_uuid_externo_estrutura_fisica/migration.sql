-- Fase 5 / fix — uuid_externo nas tabelas de estrutura física Fase 3
-- O LeitoAllocator (Trilha A da Fase 5) queries leitos por uuid_externo;
-- a migration cadastros_base não criou essas colunas. Padroniza para
-- exposição via API REST (uuid no path em vez de BIGINT).

ALTER TABLE leitos                ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE setores               ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE unidades_faturamento  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE unidades_atendimento  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE centros_custo         ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS uq_leitos_uuid                ON leitos (uuid_externo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_setores_uuid               ON setores (uuid_externo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_faturamento_uuid  ON unidades_faturamento (uuid_externo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_atendimento_uuid  ON unidades_atendimento (uuid_externo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_centros_custo_uuid         ON centros_custo (uuid_externo);
