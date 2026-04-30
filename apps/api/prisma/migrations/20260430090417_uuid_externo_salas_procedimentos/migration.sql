-- Fase 4 / fix — Adiciona uuid_externo em salas_cirurgicas e
-- tabelas_procedimentos. O repo de agendamento da Trilha A faz
-- JOIN expondo s.uuid_externo / tp.uuid_externo nessas tabelas.

ALTER TABLE salas_cirurgicas
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX IF NOT EXISTS uq_salas_cirurgicas_uuid ON salas_cirurgicas (uuid_externo);

ALTER TABLE tabelas_procedimentos
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX IF NOT EXISTS uq_tabelas_procedimentos_uuid ON tabelas_procedimentos (uuid_externo);
