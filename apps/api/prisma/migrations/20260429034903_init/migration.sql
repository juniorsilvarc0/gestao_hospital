-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CreateTable
CREATE TABLE "tenants" (
    "id" BIGSERIAL NOT NULL,
    "uuid_externo" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "cnpj" VARCHAR(18) NOT NULL,
    "razao_social" VARCHAR(300) NOT NULL,
    "nome_fantasia" VARCHAR(300),
    "cnes" VARCHAR(20),
    "registro_ans" VARCHAR(20),
    "configuracoes" JSONB NOT NULL DEFAULT '{}',
    "versao_tiss_padrao" VARCHAR(10) NOT NULL DEFAULT '4.01.00',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "usuarios" (
    "id" BIGSERIAL NOT NULL,
    "uuid_externo" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" BIGINT NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "senha_hash" VARCHAR(255),
    "mfa_secret" VARCHAR(255),
    "mfa_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "prestador_id" BIGINT,
    "nome" VARCHAR(300) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login_em" TIMESTAMPTZ,
    "ultimo_login_ip" INET,
    "tentativas_login" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_ate" TIMESTAMPTZ,
    "precisa_trocar_senha" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "perfis" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" VARCHAR(500),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "permissoes" (
    "id" BIGSERIAL NOT NULL,
    "recurso" VARCHAR(80) NOT NULL,
    "acao" VARCHAR(40) NOT NULL,
    "descricao" VARCHAR(300),
    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "usuarios_perfis" (
    "usuario_id" BIGINT NOT NULL,
    "perfil_id" BIGINT NOT NULL,
    CONSTRAINT "usuarios_perfis_pkey" PRIMARY KEY ("usuario_id","perfil_id")
);
-- CreateTable
CREATE TABLE "perfis_permissoes" (
    "perfil_id" BIGINT NOT NULL,
    "permissao_id" BIGINT NOT NULL,
    CONSTRAINT "perfis_permissoes_pkey" PRIMARY KEY ("perfil_id","permissao_id")
);
-- CreateTable
CREATE TABLE "sessoes_ativas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "usuario_id" BIGINT NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "ip" INET,
    "user_agent" TEXT,
    "expira_em" TIMESTAMPTZ NOT NULL,
    "revogada_em" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessoes_ativas_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "tenants_cnpj_key" ON "tenants"("cnpj");
-- CreateIndex
CREATE INDEX "ix_usuarios_tenant" ON "usuarios"("tenant_id");
-- CreateIndex
CREATE INDEX "ix_usuarios_prestador" ON "usuarios"("prestador_id");
-- CreateIndex
CREATE UNIQUE INDEX "uq_usuarios_email_tenant" ON "usuarios"("tenant_id", "email");
-- CreateIndex
CREATE UNIQUE INDEX "uq_perfis_codigo_tenant" ON "perfis"("tenant_id", "codigo");
-- CreateIndex
CREATE UNIQUE INDEX "uq_permissoes" ON "permissoes"("recurso", "acao");
-- CreateIndex
CREATE INDEX "ix_sessoes_usuario" ON "sessoes_ativas"("usuario_id");
-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "fk_usuarios_tenant_id" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "perfis" ADD CONSTRAINT "fk_perfis_tenant_id" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "usuarios_perfis" ADD CONSTRAINT "fk_usuarios_perfis_usuario_id" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "usuarios_perfis" ADD CONSTRAINT "fk_usuarios_perfis_perfil_id" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "fk_perfis_permissoes_perfil_id" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "fk_perfis_permissoes_permissao_id" FOREIGN KEY ("permissao_id") REFERENCES "permissoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "sessoes_ativas" ADD CONSTRAINT "fk_sessoes_ativas_usuario_id" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
