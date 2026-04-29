-- ─────────────────────────────────────────────────────────────────────
-- Fase 3 / P0 — Cadastros Gerais (DB.md §7.2)
--
-- Cria 18 tabelas de cadastro + acessos_prontuario (LGPD trail) +
-- usuario_setores (fecha ABAC stub da Fase 2).
--
-- Convenções:
--   • snake_case PT em tabelas/colunas (TISS/SUS).
--   • BIGINT autoincrement; uuid_externo UUID; tenant_id BIGINT em
--     todas tenanted; created_at/updated_at TIMESTAMPTZ; soft-delete
--     em transacionais; versao INT em alta-concorrência (leitos).
--   • RLS habilitado + FORCE em todas tenanted; POLICY tenant_isolation.
--   • tg_audit aplicada em todas (auditoria_eventos com diff JSONB).
-- ─────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- 0. Wrapper IMMUTABLE de `unaccent` (necessário em índices GIN com trigram)
-- `unaccent()` é STABLE por padrão (depende de dicionário); índices exigem
-- IMMUTABLE. Receita oficial dos docs: wrapper SQL marcado IMMUTABLE.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs do domínio (DB.md §4)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_paciente_sexo                       AS ENUM ('M', 'F', 'INDETERMINADO');
CREATE TYPE enum_paciente_tipo_atendimento_padrao    AS ENUM ('PARTICULAR', 'CONVENIO', 'SUS');
CREATE TYPE enum_prestador_tipo_conselho             AS ENUM ('CRM', 'COREN', 'CRF', 'CRN', 'CREFITO', 'CRP', 'CRO', 'CRBM', 'CRFa', 'OUTROS');
CREATE TYPE enum_prestador_tipo_vinculo              AS ENUM ('CORPO_CLINICO', 'PLANTONISTA', 'COOPERADO', 'TERCEIRO', 'CLT');
CREATE TYPE enum_convenio_tipo                       AS ENUM ('CONVENIO', 'SUS', 'PARTICULAR');
CREATE TYPE enum_procedimento_tipo                   AS ENUM ('PROCEDIMENTO', 'DIARIA', 'TAXA', 'SERVICO', 'MATERIAL', 'MEDICAMENTO', 'OPME', 'GAS', 'PACOTE');
CREATE TYPE enum_grupo_gasto                         AS ENUM ('PROCEDIMENTO', 'DIARIA', 'TAXA', 'SERVICO', 'MATERIAL', 'MEDICAMENTO', 'OPME', 'GAS', 'PACOTE', 'HONORARIO');
CREATE TYPE enum_setor_tipo                          AS ENUM ('INTERNACAO', 'AMBULATORIO', 'PRONTO_SOCORRO', 'CENTRO_CIRURGICO', 'UTI', 'CME', 'FARMACIA', 'LABORATORIO', 'IMAGEM', 'ADMINISTRATIVO');
CREATE TYPE enum_leito_tipo_acomodacao               AS ENUM ('ENFERMARIA', 'APARTAMENTO', 'UTI', 'SEMI_UTI', 'ISOLAMENTO', 'OBSERVACAO');
CREATE TYPE enum_leito_status                        AS ENUM ('DISPONIVEL', 'OCUPADO', 'RESERVADO', 'HIGIENIZACAO', 'MANUTENCAO', 'BLOQUEADO');

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Estrutura física (sem dependências) — primeiro porque outras referenciam
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE unidades_faturamento (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo      VARCHAR(20) NOT NULL,
  nome        VARCHAR(120) NOT NULL,
  cnes        VARCHAR(20),
  ativa       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT uq_uf UNIQUE (tenant_id, codigo)
);

CREATE TABLE unidades_atendimento (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo      VARCHAR(20) NOT NULL,
  nome        VARCHAR(120) NOT NULL,
  ativa       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT uq_ua UNIQUE (tenant_id, codigo)
);

CREATE TABLE centros_custo (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo      VARCHAR(20) NOT NULL,
  nome        VARCHAR(120) NOT NULL,
  parent_id   BIGINT REFERENCES centros_custo(id) ON DELETE RESTRICT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT uq_cc UNIQUE (tenant_id, codigo)
);

CREATE TABLE setores (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nome                     VARCHAR(120) NOT NULL,
  tipo                     enum_setor_tipo NOT NULL,
  unidade_faturamento_id   BIGINT NOT NULL REFERENCES unidades_faturamento(id) ON DELETE RESTRICT,
  unidade_atendimento_id   BIGINT NOT NULL REFERENCES unidades_atendimento(id) ON DELETE RESTRICT,
  centro_custo_id          BIGINT REFERENCES centros_custo(id) ON DELETE RESTRICT,
  capacidade               INTEGER,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT uq_setores_nome UNIQUE (tenant_id, nome)
);

CREATE TABLE salas_cirurgicas (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  setor_id    BIGINT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  codigo      VARCHAR(20) NOT NULL,
  nome        VARCHAR(120) NOT NULL,
  tipo        VARCHAR(50),
  status      VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL',
  ativa       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT uq_salas UNIQUE (tenant_id, codigo)
);

CREATE TABLE leitos (
  id                     BIGSERIAL PRIMARY KEY,
  tenant_id              BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  setor_id               BIGINT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  codigo                 VARCHAR(20) NOT NULL,
  tipo_acomodacao        enum_leito_tipo_acomodacao NOT NULL,
  status                 enum_leito_status NOT NULL DEFAULT 'DISPONIVEL',
  -- paciente_id e atendimento_id são nullable e ficam sem FK até as tabelas
  -- alvo serem criadas (Fase 5). Aplicação valida coerência.
  paciente_id            BIGINT,
  atendimento_id         BIGINT,
  ocupacao_iniciada_em   TIMESTAMPTZ,
  ocupacao_prevista_fim  TIMESTAMPTZ,
  extra                  BOOLEAN NOT NULL DEFAULT FALSE,
  observacao             VARCHAR(500),
  versao                 INTEGER NOT NULL DEFAULT 1,  -- otimistic lock (alocação Fase 5)
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ,
  deleted_at             TIMESTAMPTZ,
  CONSTRAINT uq_leitos_codigo UNIQUE (tenant_id, setor_id, codigo),
  CONSTRAINT ck_leitos_ocupacao CHECK (
    (status = 'OCUPADO' AND paciente_id IS NOT NULL AND atendimento_id IS NOT NULL) OR
    (status <> 'OCUPADO')
  )
);
CREATE INDEX ix_leitos_setor_status ON leitos (setor_id, status);

-- usuario_setores — fecha ABAC stub da Fase 2 (SectorFilterInterceptor).
CREATE TABLE usuario_setores (
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  setor_id    BIGINT NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, setor_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Pacientes (cripto LGPD)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE pacientes (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo                   VARCHAR(20) NOT NULL,
  nome                     VARCHAR(300) NOT NULL,
  nome_social              VARCHAR(200),
  cpf_encrypted            BYTEA,                    -- pgp_sym_encrypt
  cpf_hash                 VARCHAR(64),              -- SHA-256 (busca determinística)
  rg                       VARCHAR(20),
  cns                      VARCHAR(20),
  data_nascimento          DATE NOT NULL,
  sexo                     enum_paciente_sexo NOT NULL,
  tipo_sanguineo           VARCHAR(5),
  nome_mae                 VARCHAR(200) NOT NULL,
  nome_pai                 VARCHAR(200),
  estado_civil             VARCHAR(30),
  profissao                VARCHAR(120),
  raca_cor                 VARCHAR(30),
  nacionalidade            VARCHAR(60),
  naturalidade_uf          VARCHAR(2),
  naturalidade_cidade      VARCHAR(100),
  endereco                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  contatos                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  foto_url                 VARCHAR(500),
  alergias                 JSONB,
  comorbidades             JSONB,
  tipo_atendimento_padrao  enum_paciente_tipo_atendimento_padrao,
  obito                    BOOLEAN NOT NULL DEFAULT FALSE,
  data_obito               DATE,
  causa_obito_cid          VARCHAR(10),
  consentimento_lgpd       BOOLEAN NOT NULL DEFAULT FALSE,
  consentimento_lgpd_em    TIMESTAMPTZ,
  -- Recém-nascido sem CPF: vínculo com mãe (paciente_id) — RN-ATE-01.
  -- FK self-referencing — sem cascade.
  paciente_mae_id          BIGINT REFERENCES pacientes(id) ON DELETE RESTRICT,
  campos_complementares    JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  updated_at               TIMESTAMPTZ,
  updated_by               BIGINT,
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT,
  versao                   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_pacientes_codigo_tenant UNIQUE (tenant_id, codigo),
  CONSTRAINT uq_pacientes_cpf_tenant   UNIQUE (tenant_id, cpf_hash),
  CONSTRAINT uq_pacientes_cns_tenant   UNIQUE (tenant_id, cns),
  CONSTRAINT ck_pacientes_obito CHECK (
    (obito = FALSE AND data_obito IS NULL) OR
    (obito = TRUE  AND data_obito IS NOT NULL AND data_obito <= CURRENT_DATE)
  )
);
CREATE INDEX ix_pacientes_nome_trgm ON pacientes USING gin (f_unaccent(nome) gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX ix_pacientes_data_nasc ON pacientes (tenant_id, data_nascimento) WHERE deleted_at IS NULL;
CREATE INDEX ix_pacientes_alergias ON pacientes USING gin (alergias jsonb_path_ops);
CREATE INDEX ix_pacientes_mae ON pacientes (paciente_mae_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Convênios e planos
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE convenios (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo          VARCHAR(20) NOT NULL,
  nome            VARCHAR(300) NOT NULL,
  cnpj            VARCHAR(18) NOT NULL,
  registro_ans    VARCHAR(20),
  tipo            enum_convenio_tipo NOT NULL,
  padrao_tiss     BOOLEAN NOT NULL DEFAULT TRUE,
  versao_tiss     VARCHAR(10) NOT NULL DEFAULT '4.01.00',
  url_webservice  VARCHAR(500),
  contato         JSONB,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT uq_convenios_codigo UNIQUE (tenant_id, codigo),
  CONSTRAINT uq_convenios_cnpj UNIQUE (tenant_id, cnpj)
);

CREATE TABLE planos (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  codigo              VARCHAR(20) NOT NULL,
  nome                VARCHAR(200) NOT NULL,
  registro_ans        VARCHAR(20),
  tipo_acomodacao     enum_leito_tipo_acomodacao,
  segmentacao         VARCHAR(50),
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_planos_codigo UNIQUE (convenio_id, codigo)
);

CREATE TABLE condicoes_contratuais (
  id                            BIGSERIAL PRIMARY KEY,
  tenant_id                     BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  convenio_id                   BIGINT NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  plano_id                      BIGINT REFERENCES planos(id) ON DELETE CASCADE,
  versao                        INTEGER NOT NULL DEFAULT 1,
  vigencia_inicio               DATE NOT NULL,
  vigencia_fim                  DATE,
  coberturas                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  especialidades_habilitadas    JSONB,
  agrupamentos                  JSONB,
  parametros_tiss               JSONB,
  iss_aliquota                  DECIMAL(7,4),
  iss_retem                     BOOLEAN NOT NULL DEFAULT FALSE,
  exige_autorizacao_internacao  BOOLEAN NOT NULL DEFAULT TRUE,
  exige_autorizacao_opme        BOOLEAN NOT NULL DEFAULT TRUE,
  prazo_envio_lote_dias         INTEGER NOT NULL DEFAULT 30,
  ativo                         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cc_versao UNIQUE (convenio_id, plano_id, versao),
  CONSTRAINT ck_cc_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Pacientes × Convênios
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE pacientes_convenios (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id) ON DELETE RESTRICT,
  plano_id            BIGINT REFERENCES planos(id) ON DELETE RESTRICT,
  numero_carteirinha  VARCHAR(40) NOT NULL,
  validade            DATE,
  titular             BOOLEAN NOT NULL DEFAULT TRUE,
  parentesco_titular  VARCHAR(40),
  prioridade          INTEGER NOT NULL DEFAULT 1,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_pac_conv_carteirinha UNIQUE (tenant_id, convenio_id, numero_carteirinha)
);
CREATE INDEX ix_pac_conv_paciente ON pacientes_convenios (paciente_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Prestadores
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE prestadores (
  id                 BIGSERIAL PRIMARY KEY,
  uuid_externo       UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  nome               VARCHAR(300) NOT NULL,
  nome_social        VARCHAR(200),
  cpf_hash           VARCHAR(64),
  tipo_conselho      enum_prestador_tipo_conselho NOT NULL,
  numero_conselho    VARCHAR(20) NOT NULL,
  uf_conselho        VARCHAR(2) NOT NULL,
  rqe                VARCHAR(20),
  tipo_vinculo       enum_prestador_tipo_vinculo NOT NULL,
  recebe_repasse     BOOLEAN NOT NULL DEFAULT TRUE,
  repasse_diaria     BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_taxa       BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_servico    BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_matmed     BOOLEAN NOT NULL DEFAULT FALSE,
  socio_cooperado    BOOLEAN NOT NULL DEFAULT FALSE,
  credenciado_direto JSONB,
  dados_bancarios    JSONB,
  cbo_principal      VARCHAR(10),
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT uq_prestadores_conselho UNIQUE (tenant_id, tipo_conselho, numero_conselho, uf_conselho)
);
CREATE INDEX ix_prestadores_nome_trgm ON prestadores USING gin (f_unaccent(nome) gin_trgm_ops) WHERE deleted_at IS NULL;

-- Now we can promote `usuarios.prestador_id` from BigInt? sem FK para FK real.
ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_prestador_id
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id) ON DELETE SET NULL;

CREATE TABLE especialidades (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo_cbos VARCHAR(10) NOT NULL,
  nome        VARCHAR(200) NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_especialidades_codigo UNIQUE (tenant_id, codigo_cbos)
);

CREATE TABLE prestadores_especialidades (
  prestador_id     BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE CASCADE,
  especialidade_id BIGINT NOT NULL REFERENCES especialidades(id) ON DELETE RESTRICT,
  principal        BOOLEAN NOT NULL DEFAULT FALSE,
  rqe              VARCHAR(20),
  PRIMARY KEY (prestador_id, especialidade_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Catálogo de procedimentos (TUSS/CBHPM/CID/CBO/SUS)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE tabelas_procedimentos (
  id                   BIGSERIAL PRIMARY KEY,
  tenant_id            BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo_tuss          VARCHAR(20) NOT NULL,
  codigo_cbhpm         VARCHAR(20),
  codigo_amb           VARCHAR(20),
  codigo_sus           VARCHAR(20),
  codigo_anvisa        VARCHAR(20),
  codigo_ean           VARCHAR(20),
  nome                 VARCHAR(500) NOT NULL,
  nome_reduzido        VARCHAR(120),
  tipo                 enum_procedimento_tipo NOT NULL,
  grupo_gasto          enum_grupo_gasto NOT NULL,
  tabela_tiss          VARCHAR(10),
  unidade_medida       VARCHAR(20),
  fator_conversao      DECIMAL(18,6) DEFAULT 1.0,
  valor_referencia     DECIMAL(18,4),
  porte                VARCHAR(10),
  custo_operacional    DECIMAL(18,4),
  precisa_autorizacao  BOOLEAN NOT NULL DEFAULT FALSE,
  precisa_assinatura   BOOLEAN NOT NULL DEFAULT FALSE,
  precisa_lote         BOOLEAN NOT NULL DEFAULT FALSE,
  controlado           BOOLEAN NOT NULL DEFAULT FALSE,
  alto_custo           BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ,
  CONSTRAINT uq_proc_tuss UNIQUE (tenant_id, codigo_tuss)
);
CREATE INDEX ix_proc_nome_trgm ON tabelas_procedimentos USING gin (f_unaccent(nome) gin_trgm_ops);
CREATE INDEX ix_proc_tipo ON tabelas_procedimentos (tenant_id, tipo) WHERE ativo;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Tabelas de preços
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE tabelas_precos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  codigo          VARCHAR(40) NOT NULL,
  nome            VARCHAR(200) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim    DATE,
  versao          INTEGER NOT NULL DEFAULT 1,
  ativa           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tp_codigo UNIQUE (tenant_id, codigo, versao)
);

CREATE TABLE tabelas_precos_itens (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT NOT NULL,
  tabela_id          BIGINT NOT NULL REFERENCES tabelas_precos(id) ON DELETE CASCADE,
  procedimento_id    BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  valor              DECIMAL(18,4) NOT NULL,
  valor_filme        DECIMAL(18,4),
  porte_anestesico   VARCHAR(10),
  tempo_minutos      INTEGER,
  custo_operacional  DECIMAL(18,4),
  observacao         VARCHAR(500),
  CONSTRAINT uq_tpi UNIQUE (tabela_id, procedimento_id),
  CONSTRAINT ck_tpi_valor CHECK (valor >= 0)
);

-- Vínculo M:N convênio (× plano opcional) × tabela_precos.
-- DB.md sugere PK com COALESCE(plano_id, 0), mas Postgres não aceita
-- function-call em PRIMARY KEY. Solução: surrogate id + unique parciais
-- (NULL e NOT NULL como conjuntos disjuntos).
CREATE TABLE convenios_tabelas_precos (
  id           BIGSERIAL PRIMARY KEY,
  convenio_id  BIGINT NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  plano_id     BIGINT REFERENCES planos(id) ON DELETE CASCADE,
  tabela_id    BIGINT NOT NULL REFERENCES tabelas_precos(id) ON DELETE RESTRICT,
  prioridade   INTEGER NOT NULL DEFAULT 1,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ctp_with_plano    ON convenios_tabelas_precos (convenio_id, plano_id, tabela_id) WHERE plano_id IS NOT NULL;
CREATE UNIQUE INDEX uq_ctp_without_plano ON convenios_tabelas_precos (convenio_id, tabela_id)            WHERE plano_id IS NULL;
CREATE INDEX ix_ctp_convenio ON convenios_tabelas_precos (convenio_id) WHERE ativo;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. acessos_prontuario (LGPD trail — particionada mensalmente)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE acessos_prontuario (
  id              BIGSERIAL,
  tenant_id       BIGINT NOT NULL,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  -- atendimento_id sem FK (atendimentos chega na Fase 5)
  atendimento_id  BIGINT,
  usuario_id      BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  perfil          VARCHAR(50) NOT NULL,
  finalidade      VARCHAR(200) NOT NULL,
  modulo          VARCHAR(50) NOT NULL,
  ip              INET,
  acessado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, acessado_em)
) PARTITION BY RANGE (acessado_em);

CREATE TABLE acessos_prontuario_2026_04 PARTITION OF acessos_prontuario
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE acessos_prontuario_2026_05 PARTITION OF acessos_prontuario
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE acessos_prontuario_2026_06 PARTITION OF acessos_prontuario
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX ix_acesso_paciente ON acessos_prontuario (paciente_id, acessado_em DESC);
CREATE INDEX ix_acesso_usuario  ON acessos_prontuario (usuario_id, acessado_em DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Triggers de auditoria (tg_audit) em todas as tabelas tenanted
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON pacientes              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON pacientes_convenios    FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON prestadores            FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON convenios              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON planos                 FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON condicoes_contratuais  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON tabelas_precos         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON tabelas_precos_itens   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON unidades_faturamento   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON unidades_atendimento   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON centros_custo          FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON setores                FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON salas_cirurgicas       FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON leitos                 FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
-- tabelas_procedimentos é catálogo global e MUITO grande — log via audit é
-- caro. Skipped por enquanto; adicionar se compliance exigir.

-- ═══════════════════════════════════════════════════════════════════════
-- 11. RLS — habilita + FORCE em todas tenanted
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE pacientes              ENABLE ROW LEVEL SECURITY;  ALTER TABLE pacientes              FORCE ROW LEVEL SECURITY;
ALTER TABLE pacientes_convenios    ENABLE ROW LEVEL SECURITY;  ALTER TABLE pacientes_convenios    FORCE ROW LEVEL SECURITY;
ALTER TABLE prestadores            ENABLE ROW LEVEL SECURITY;  ALTER TABLE prestadores            FORCE ROW LEVEL SECURITY;
ALTER TABLE especialidades         ENABLE ROW LEVEL SECURITY;  ALTER TABLE especialidades         FORCE ROW LEVEL SECURITY;
ALTER TABLE convenios              ENABLE ROW LEVEL SECURITY;  ALTER TABLE convenios              FORCE ROW LEVEL SECURITY;
ALTER TABLE planos                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE planos                 FORCE ROW LEVEL SECURITY;
ALTER TABLE condicoes_contratuais  ENABLE ROW LEVEL SECURITY;  ALTER TABLE condicoes_contratuais  FORCE ROW LEVEL SECURITY;
ALTER TABLE tabelas_precos         ENABLE ROW LEVEL SECURITY;  ALTER TABLE tabelas_precos         FORCE ROW LEVEL SECURITY;
ALTER TABLE tabelas_precos_itens   ENABLE ROW LEVEL SECURITY;  ALTER TABLE tabelas_precos_itens   FORCE ROW LEVEL SECURITY;
ALTER TABLE tabelas_procedimentos  ENABLE ROW LEVEL SECURITY;  ALTER TABLE tabelas_procedimentos  FORCE ROW LEVEL SECURITY;
ALTER TABLE unidades_faturamento   ENABLE ROW LEVEL SECURITY;  ALTER TABLE unidades_faturamento   FORCE ROW LEVEL SECURITY;
ALTER TABLE unidades_atendimento   ENABLE ROW LEVEL SECURITY;  ALTER TABLE unidades_atendimento   FORCE ROW LEVEL SECURITY;
ALTER TABLE centros_custo          ENABLE ROW LEVEL SECURITY;  ALTER TABLE centros_custo          FORCE ROW LEVEL SECURITY;
ALTER TABLE setores                ENABLE ROW LEVEL SECURITY;  ALTER TABLE setores                FORCE ROW LEVEL SECURITY;
ALTER TABLE salas_cirurgicas       ENABLE ROW LEVEL SECURITY;  ALTER TABLE salas_cirurgicas       FORCE ROW LEVEL SECURITY;
ALTER TABLE leitos                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE leitos                 FORCE ROW LEVEL SECURITY;
ALTER TABLE acessos_prontuario     ENABLE ROW LEVEL SECURITY;  ALTER TABLE acessos_prontuario     FORCE ROW LEVEL SECURITY;

-- POLICIES — todas usam o mesmo padrão (deny-by-default).
CREATE POLICY tenant_isolation ON pacientes              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON pacientes_convenios    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON prestadores            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON especialidades         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON convenios              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON planos                 USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON condicoes_contratuais  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON tabelas_precos         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON tabelas_precos_itens   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON tabelas_procedimentos  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON unidades_faturamento   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON unidades_atendimento   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON centros_custo          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON setores                USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON salas_cirurgicas       USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON leitos                 USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON acessos_prontuario     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
