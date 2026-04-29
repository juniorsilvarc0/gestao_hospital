-- ─────────────────────────────────────────────────────────────────────
-- HMS-BR — init.sql do Postgres (executado APENAS na primeira inicialização
-- do volume `pg_data`, via /docker-entrypoint-initdb.d).
--
-- O entrypoint oficial da imagem postgres já criou a database/role definidos
-- por POSTGRES_DB / POSTGRES_USER (default do projeto: hms / hms) e roda este
-- script com `psql -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB`.
-- A sessão ATUAL está conectada na database da aplicação como SUPERUSER
-- (POSTGRES_USER é forçado a SUPERUSER pelo entrypoint da imagem).
--
-- Por isso, o role bootstrap (`hms`) NÃO pode ser usado em runtime — RLS
-- não aplica em superusers. Criamos `hms_app` (NOSUPERUSER, NOBYPASSRLS,
-- com CREATEDB) e transferimos ownership.
--
-- IMPORTANTE: este script SOMENTE roda na primeira inicialização.
-- Para reaplicar em ambiente já provisionado, recrie o volume (`make reset`).
-- ─────────────────────────────────────────────────────────────────────

-- 1) Extensions na database principal (criadas como superuser bootstrap).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS tablefunc;

-- 2) Cria a role da aplicação (NOSUPERUSER + NOBYPASSRLS + CREATEDB).
--    Senha vem do env (POSTGRES_APP_PASSWORD). Se não definida, usa default
--    de dev (que NUNCA deve ir para produção).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hms_app') THEN
    CREATE ROLE hms_app WITH
      LOGIN
      NOSUPERUSER
      NOBYPASSRLS
      CREATEDB
      PASSWORD 'hms_app_dev_pwd';
  END IF;
END
$$;

-- 3) Shadow database para `prisma migrate dev` (owner = hms_app para que
--    Prisma rodando como hms_app consiga gerenciar e instalar extensions).
SELECT format('CREATE DATABASE %I OWNER %I', 'hms_shadow', 'hms_app')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'hms_shadow')
\gexec

-- 4) Permissões de conexão.
GRANT CONNECT ON DATABASE hms TO hms_app;
GRANT CONNECT ON DATABASE hms_shadow TO hms_app;

-- 5) Transfere ownership do schema public e tudo o mais para hms_app.
--    Em fresh install, schema public está vazio (Prisma migrate vai
--    popular). Apenas o schema em si troca de dono — futuras tabelas
--    criadas pelo Prisma como hms_app já nascem com owner correto.
ALTER SCHEMA public OWNER TO hms_app;

-- 6) Permissões padrão para futuras tabelas/sequences (Prisma cria como
--    hms_app, então default privileges são auto-aplicados).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO hms_app;

-- 7) Extensions na shadow database (instaladas pelo superuser; Prisma
--    rodando como hms_app NÃO consegue instalar extensions sem trusted=t,
--    então pré-instalamos aqui).
\connect hms_shadow
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS tablefunc;
ALTER SCHEMA public OWNER TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO hms_app;
