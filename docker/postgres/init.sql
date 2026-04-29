-- ─────────────────────────────────────────────────────────────────────
-- HMS-BR — init.sql do Postgres (executado APENAS na primeira inicialização
-- do volume `pg_data`, via /docker-entrypoint-initdb.d).
--
-- O entrypoint oficial da imagem postgres já criou a database/role definidos
-- por POSTGRES_DB / POSTGRES_USER (default do projeto: hms / hms) e roda este
-- script com `psql -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB`.
-- Logo, a sessão ATUAL já está conectada na database da aplicação como
-- superuser — basta CREATE EXTENSION.
--
-- Habilita extensions canônicas exigidas em CLAUDE.md §6 e DB.md §1.
-- Cria a shadow database usada pelo `prisma migrate dev` (idempotente).
-- Concede CREATEDB ao role da aplicação (Prisma cria/dropa shadow se preciso).
--
-- IMPORTANTE: este script SOMENTE roda na primeira inicialização.
-- Para reaplicar em ambiente já provisionado, conecte manualmente como
-- superuser ou recrie o volume (`make reset`).
-- ─────────────────────────────────────────────────────────────────────

-- 1) Extensions na database principal (já conectada).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS tablefunc;

-- 2) Concede CREATEDB ao usuário atual (role da aplicação).
--    Prisma migrate dev precisa de CREATEDB para gerenciar a shadow database.
DO $$
DECLARE
  app_role text := current_user;
BEGIN
  EXECUTE format('ALTER ROLE %I WITH CREATEDB', app_role);
END
$$;

-- 3) Shadow database para `prisma migrate dev`. Idempotente.
--    `CREATE DATABASE` não pode rodar dentro de DO/transação, então usamos \gexec.
SELECT format('CREATE DATABASE %I OWNER %I', 'hms_shadow', current_user)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'hms_shadow')
\gexec

-- 4) Habilita as MESMAS extensions na shadow database (Prisma assume paridade).
\connect hms_shadow
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS tablefunc;
