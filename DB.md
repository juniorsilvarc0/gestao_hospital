# DB.md — Modelagem de Banco de Dados (Fonte da Verdade)

> **Documento de prioridade máxima.** Toda decisão de persistência do HMS-BR está aqui.
> Em conflito com qualquer outro documento, **`DB.md` prevalece**.
> Versão 1.0 — Março/2026 · PostgreSQL 16

---

## Sumário

1. [Princípios de modelagem](#1-princípios-de-modelagem)
2. [Convenções universais](#2-convenções-universais)
3. [Extensões PostgreSQL](#3-extensões-postgresql-obrigatórias)
4. [Tipos enumerados (ENUM)](#4-tipos-enumerados-enum)
5. [Multi-tenancy e RLS](#5-multi-tenancy-e-rls)
6. [Auditoria e LGPD](#6-auditoria-e-lgpd)
7. [Catálogo completo de tabelas](#7-catálogo-completo-de-tabelas)
8. [Índices e performance](#8-índices-e-performance)
9. [Particionamento](#9-particionamento)
10. [Constraints e regras transacionais](#10-constraints-e-regras-transacionais)
11. [Diagrama relacional (visão por contexto)](#11-diagrama-relacional-visão-por-contexto)
12. [Estratégia de migrations](#12-estratégia-de-migrations)
13. [Seeds e dados de referência](#13-seeds-e-dados-de-referência)

---

## 1. Princípios de modelagem

1. **Domain-aligned naming** — nomes em português brasileiro, espelhando a terminologia TISS/SUS/ANS. `pacientes`, `convenios`, `glosas`, `repasses`. Isso permite que analistas de faturamento (não-devs) leiam o schema diretamente.
2. **Normalização 3NF como padrão**, com **JSONB pontual** apenas para:
   - Formulários dinâmicos do PEP (anamnese, exame clínico).
   - Conteúdo de evolução estruturado mas variável.
   - Snapshot de regras (criterios_repasse.regras), por necessidade de versionamento.
   - Endereços e contatos (compactam várias colunas em uma estrutura validada).
3. **Soft-delete em todas as tabelas clínicas e financeiras** (`deleted_at`, `deleted_by`). Tabelas de catálogo (procedimentos, convênios, etc.) também usam soft-delete via `ativo BOOLEAN`.
4. **Imutabilidade após assinatura digital** — registros assinados (evolução, prescrição, laudo) não podem ser `UPDATE`-ados. Trigger bloqueia. Correções criam nova versão.
5. **Auditoria automática por trigger** — toda tabela clínica/financeira recebe trigger `tg_audit` que escreve diff JSONB em `auditoria_eventos`.
6. **Idempotência financeira** — operações de faturamento, glosa, repasse usam UUID de operação (`operacao_id`) para evitar duplicação em retry.
7. **Multi-tenant por linha** — toda tabela aplicável tem `tenant_id`, com RLS reforçando isolamento.
8. **Snapshots de regras** — quando uma conta é fechada, copia-se *snapshot* da tabela de preços, condição contratual e versão TISS para colunas/JSONB da própria conta. **Histórico não pode quebrar quando catálogo muda.**
9. **Numerários sempre `DECIMAL(18,4)`** — quantidades em `DECIMAL(18,6)` (medicamentos têm doses fracionárias).
10. **IDs `BIGSERIAL`** internos + `uuid_externo UUID` para integrações externas (TISS guia, mobile, parceiros). Externamente expõe-se UUID, internamente FKs usam BIGINT (joins mais rápidos).
11. **Datas e horários sempre `TIMESTAMPTZ`** com armazenamento em UTC. Conversão para fuso do hospital na borda (controller).
12. **Constraints declarativas** sobre triggers — `CHECK`, `EXCLUDE`, `FOREIGN KEY ON DELETE RESTRICT` por padrão. `CASCADE` apenas em filhos triviais (itens de listas auxiliares).
13. **Particionamento range-mensal** nas três grandes (`evolucoes`, `prescricoes`, `dispensacoes`).

---

## 2. Convenções universais

### 2.1 Nomenclatura

| Objeto | Padrão | Exemplo |
|---|---|---|
| Tabela | snake_case, plural | `pacientes`, `contas_itens` |
| Coluna | snake_case, singular | `data_nascimento`, `valor_total` |
| PK | `id` | — |
| FK | `<entidade_singular>_id` | `paciente_id`, `convenio_id` |
| Tipo ENUM | `enum_<contexto>_<nome>` | `enum_atendimento_status` |
| Index | `ix_<tabela>_<colunas>` | `ix_atendimentos_paciente_data` |
| Unique | `uq_<tabela>_<colunas>` | `uq_pacientes_cpf_tenant` |
| FK (constraint) | `fk_<tabela>_<col>` | `fk_atendimentos_paciente_id` |
| Check | `ck_<tabela>_<regra>` | `ck_contas_valor_total_positivo` |
| Exclude | `xc_<tabela>_<regra>` | `xc_leitos_ocupacao_unica` |
| Trigger | `tg_<tabela>_<evento>` | `tg_evolucoes_audit` |
| Função | `fn_<contexto>_<verbo>` | `fn_audit_changes` |
| Schema | (default `public`) com schemas dedicados para reporting (`reporting`), audit (`audit`), arquivado (`archive`) |

### 2.2 Colunas universais (presentes em **toda** tabela transacional)

```sql
id              BIGSERIAL    PRIMARY KEY,
uuid_externo    UUID         NOT NULL DEFAULT uuid_generate_v4(),
tenant_id       BIGINT       NOT NULL,                  -- multi-tenancy
created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
created_by      BIGINT,                                  -- usuario_id (FK lógica)
updated_at      TIMESTAMPTZ,
updated_by      BIGINT,
deleted_at      TIMESTAMPTZ,                             -- soft-delete
deleted_by      BIGINT,
versao          INTEGER      NOT NULL DEFAULT 1          -- otimistic locking
```

Tabelas de catálogo (puramente de configuração) podem omitir `deleted_at` e usar `ativo BOOLEAN NOT NULL DEFAULT TRUE`.

### 2.3 Padrão de soft-delete

Toda query da aplicação **DEVE** filtrar `WHERE deleted_at IS NULL` (Prisma faz isso via middleware global). Reativação não existe — re-cadastro gera novo `id` e linka via `restored_from_id`.

---

## 3. Extensões PostgreSQL obrigatórias

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID v4
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- crypt, hash, encrypt
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- busca por similaridade (nomes, medicamentos)
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- índices GIN combinando JSONB + colunas
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- usado em EXCLUDE constraints (ex.: leitos)
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- busca sem acento
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- observabilidade
CREATE EXTENSION IF NOT EXISTS "tablefunc";   -- pivot para relatórios
```

---

## 4. Tipos enumerados (ENUM)

> **Decisão**: ENUMs são tipos PostgreSQL, **não** `VARCHAR + CHECK`. Razões: integridade no banco, planos de execução melhores, uso em particionamento, evita typos. Adicionar valor é seguro com `ALTER TYPE ADD VALUE`. Renomear/remover exige migration cuidadosa.

```sql
-- Pacientes
CREATE TYPE enum_paciente_sexo AS ENUM ('M', 'F', 'INDETERMINADO');
CREATE TYPE enum_paciente_tipo_atendimento_padrao AS ENUM ('PARTICULAR', 'CONVENIO', 'SUS');

-- Prestadores
CREATE TYPE enum_prestador_tipo_conselho AS ENUM ('CRM', 'COREN', 'CRF', 'CRN', 'CREFITO', 'CRP', 'CRO', 'CRBM', 'CRFa', 'OUTROS');
CREATE TYPE enum_prestador_tipo_vinculo AS ENUM ('CORPO_CLINICO', 'PLANTONISTA', 'COOPERADO', 'TERCEIRO', 'CLT');

-- Convênios
CREATE TYPE enum_convenio_tipo AS ENUM ('CONVENIO', 'SUS', 'PARTICULAR');

-- Catálogo de procedimentos
CREATE TYPE enum_procedimento_tipo AS ENUM (
  'PROCEDIMENTO', 'DIARIA', 'TAXA', 'SERVICO',
  'MATERIAL', 'MEDICAMENTO', 'OPME', 'GAS', 'PACOTE'
);
CREATE TYPE enum_grupo_gasto AS ENUM (
  'PROCEDIMENTO', 'DIARIA', 'TAXA', 'SERVICO',
  'MATERIAL', 'MEDICAMENTO', 'OPME', 'GAS', 'PACOTE', 'HONORARIO'
);

-- Setores
CREATE TYPE enum_setor_tipo AS ENUM (
  'INTERNACAO', 'AMBULATORIO', 'PRONTO_SOCORRO', 'CENTRO_CIRURGICO',
  'UTI', 'CME', 'FARMACIA', 'LABORATORIO', 'IMAGEM', 'ADMINISTRATIVO'
);

-- Leitos
CREATE TYPE enum_leito_tipo_acomodacao AS ENUM (
  'ENFERMARIA', 'APARTAMENTO', 'UTI', 'SEMI_UTI', 'ISOLAMENTO', 'OBSERVACAO'
);
CREATE TYPE enum_leito_status AS ENUM (
  'DISPONIVEL', 'OCUPADO', 'RESERVADO', 'HIGIENIZACAO', 'MANUTENCAO', 'BLOQUEADO'
);

-- Atendimentos
CREATE TYPE enum_atendimento_tipo AS ENUM (
  'CONSULTA', 'EXAME', 'INTERNACAO', 'CIRURGIA',
  'PRONTO_ATENDIMENTO', 'TELECONSULTA', 'OBSERVACAO'
);
CREATE TYPE enum_atendimento_classificacao_risco AS ENUM (
  'VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'
);
CREATE TYPE enum_atendimento_tipo_alta AS ENUM (
  'ALTA_MEDICA', 'ALTA_PEDIDO', 'TRANSFERENCIA', 'EVASAO', 'OBITO'
);
CREATE TYPE enum_atendimento_status AS ENUM (
  'AGENDADO', 'EM_ESPERA', 'EM_TRIAGEM', 'EM_ATENDIMENTO',
  'INTERNADO', 'ALTA', 'CANCELADO', 'NAO_COMPARECEU'
);
CREATE TYPE enum_tipo_cobranca AS ENUM ('PARTICULAR', 'CONVENIO', 'SUS');

-- PEP
CREATE TYPE enum_evolucao_tipo_profissional AS ENUM (
  'MEDICO', 'ENFERMEIRO', 'TECNICO_ENFERMAGEM', 'NUTRICIONISTA',
  'FISIOTERAPEUTA', 'PSICOLOGO', 'FARMACEUTICO', 'FONOAUDIOLOGO',
  'TERAPEUTA_OCUPACIONAL', 'ASSISTENTE_SOCIAL', 'OUTROS'
);
CREATE TYPE enum_evolucao_tipo AS ENUM (
  'ANAMNESE', 'EXAME_CLINICO', 'EVOLUCAO',
  'NOTA_ADMISSAO', 'NOTA_ALTA', 'PARECER', 'INTERCONSULTA', 'RESUMO_ALTA'
);

-- Prescrições
CREATE TYPE enum_prescricao_tipo AS ENUM (
  'MEDICAMENTO', 'CUIDADO', 'DIETA', 'PROCEDIMENTO', 'EXAME', 'COMPOSTA'
);
CREATE TYPE enum_prescricao_status AS ENUM (
  'ATIVA', 'SUSPENSA', 'CANCELADA', 'ENCERRADA',
  'RECUSADA_FARMACIA', 'AGUARDANDO_ANALISE'
);
CREATE TYPE enum_analise_farmaceutica_status AS ENUM (
  'APROVADA', 'RECUSADA', 'APROVADA_RESSALVAS', 'PENDENTE'
);

-- Solicitações de exame
CREATE TYPE enum_solicitacao_exame_urgencia AS ENUM ('ROTINA', 'URGENTE', 'EMERGENCIA');
CREATE TYPE enum_solicitacao_exame_status AS ENUM (
  'SOLICITADO', 'AUTORIZADO', 'COLETADO', 'EM_PROCESSAMENTO',
  'LAUDO_PARCIAL', 'LAUDO_FINAL', 'CANCELADO', 'NEGADO'
);

-- Faturamento
CREATE TYPE enum_conta_status AS ENUM (
  'ABERTA', 'EM_ELABORACAO', 'FECHADA', 'FATURADA',
  'GLOSADA_PARCIAL', 'GLOSADA_TOTAL', 'PAGA', 'CANCELADA'
);
CREATE TYPE enum_conta_origem_item AS ENUM (
  'PEP', 'PRESCRICAO', 'CIRURGIA', 'EXAME', 'MANUAL', 'FARMACIA', 'PACOTE'
);
CREATE TYPE enum_guia_tiss_tipo AS ENUM (
  'CONSULTA', 'SP_SADT', 'INTERNACAO', 'HONORARIOS',
  'OUTRAS_DESPESAS', 'RESUMO_INTERNACAO', 'ANEXO_OPME'
);
CREATE TYPE enum_guia_tiss_status AS ENUM (
  'GERADA', 'VALIDADA', 'ENVIADA', 'ACEITA', 'RECUSADA', 'GLOSADA'
);
CREATE TYPE enum_lote_tiss_status AS ENUM (
  'EM_PREPARACAO', 'GERADO', 'ENVIADO', 'PROCESSADO', 'COM_ERRO'
);

-- Glosas
CREATE TYPE enum_glosa_status AS ENUM (
  'RECEBIDA', 'EM_ANALISE', 'EM_RECURSO', 'ACATADA',
  'REVERTIDA_TOTAL', 'REVERTIDA_PARCIAL', 'PERDA_DEFINITIVA'
);

-- Repasse
CREATE TYPE enum_repasse_tipo_base_calculo AS ENUM (
  'VALOR_TOTAL', 'VALOR_COM_DEDUCOES', 'VALOR_COM_ACRESCIMOS', 'VALOR_LIQUIDO_PAGO'
);
CREATE TYPE enum_repasse_momento AS ENUM (
  'AO_FATURAR', 'AO_CONFIRMAR_RECEBIMENTO', 'COM_PRAZO_DEFINIDO'
);
CREATE TYPE enum_repasse_status AS ENUM (
  'APURADO', 'CONFERIDO', 'LIBERADO', 'PAGO', 'CANCELADO'
);

-- Dispensação
CREATE TYPE enum_dispensacao_tipo AS ENUM (
  'POR_PRESCRICAO', 'AVULSA', 'KIT_CIRURGICO', 'DEVOLUCAO', 'TROCA'
);
CREATE TYPE enum_dispensacao_status AS ENUM (
  'PENDENTE', 'SEPARADO', 'DISPENSADO', 'DEVOLVIDO', 'CANCELADO'
);

-- Cirurgia
CREATE TYPE enum_cirurgia_tipo_anestesia AS ENUM (
  'GERAL', 'LOCAL', 'REGIONAL', 'SEDACAO', 'NENHUMA'
);
CREATE TYPE enum_cirurgia_classificacao AS ENUM (
  'LIMPA', 'POTENCIAL_CONTAMINADA', 'CONTAMINADA', 'INFECTADA'
);
CREATE TYPE enum_cirurgia_status AS ENUM (
  'AGENDADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'SUSPENSA'
);

-- CME
CREATE TYPE enum_cme_etapa AS ENUM (
  'RECEPCAO', 'LIMPEZA', 'PREPARO', 'ESTERILIZACAO', 'GUARDA', 'DISTRIBUICAO'
);
CREATE TYPE enum_cme_metodo_esterilizacao AS ENUM (
  'AUTOCLAVE', 'OXIDO_ETILENO', 'PLASMA', 'OZONIO', 'QUIMICO_LIQUIDO'
);
```

---

## 5. Multi-tenancy e RLS

### 5.1 Estratégia escolhida: **schema único + tenant_id + RLS**

> Avaliado vs schema-por-tenant e DB-por-tenant. Detalhes em `ARCHITECTURE.md` §4.

### 5.2 Implementação

```sql
-- Toda tabela aplicável tem:
tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT;

-- Habilitar RLS:
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacientes FORCE ROW LEVEL SECURITY;

-- Policy:
CREATE POLICY tenant_isolation ON pacientes
  USING (tenant_id = current_setting('app.current_tenant_id')::BIGINT);

-- A aplicação seta a variável a cada conexão/transação:
SET LOCAL app.current_tenant_id = '<id_do_tenant_no_jwt>';
```

### 5.3 Tabela `tenants`

```sql
CREATE TABLE tenants (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  cnpj            VARCHAR(18) NOT NULL UNIQUE,
  razao_social    VARCHAR(300) NOT NULL,
  nome_fantasia   VARCHAR(300),
  cnes            VARCHAR(20),                        -- Código CNES (ANS)
  registro_ans    VARCHAR(20),
  configuracoes   JSONB NOT NULL DEFAULT '{}'::jsonb, -- timezone, idioma, branding, módulos habilitados
  versao_tiss_padrao VARCHAR(10) NOT NULL DEFAULT '4.01.00',
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
```

---

## 6. Auditoria e LGPD

### 6.1 `auditoria_eventos`

```sql
CREATE TABLE auditoria_eventos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  tabela          VARCHAR(120) NOT NULL,
  registro_id     BIGINT NOT NULL,
  operacao        CHAR(1) NOT NULL CHECK (operacao IN ('I','U','D','S')), -- Insert/Update/Delete/Soft-delete
  diff            JSONB NOT NULL,                        -- {antes, depois}
  usuario_id      BIGINT,
  ip              INET,
  user_agent      TEXT,
  finalidade      VARCHAR(200),                          -- LGPD: por que acessou
  correlation_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Particionamento mensal — cresce muito
CREATE TABLE auditoria_eventos_2026_03 PARTITION OF auditoria_eventos
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... (gerado por job mensal)

CREATE INDEX ix_audit_tenant_tabela_registro ON auditoria_eventos (tenant_id, tabela, registro_id);
CREATE INDEX ix_audit_usuario ON auditoria_eventos (usuario_id, created_at DESC);
CREATE INDEX ix_audit_correlation ON auditoria_eventos (correlation_id);
```

### 6.2 `acessos_prontuario` (LGPD reforçado)

Auditoria **adicional** específica para acesso a prontuário (LGPD trata dado de saúde como sensível, exigindo registro de finalidade explícita):

```sql
CREATE TABLE acessos_prontuario (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id),
  atendimento_id  BIGINT REFERENCES atendimentos(id),
  usuario_id      BIGINT NOT NULL,
  perfil          VARCHAR(50) NOT NULL,
  finalidade      VARCHAR(200) NOT NULL,
  modulo          VARCHAR(50) NOT NULL,                  -- PEP, FARMACIA, FATURAMENTO...
  ip              INET,
  acessado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (acessado_em);

CREATE INDEX ix_acesso_paciente ON acessos_prontuario (paciente_id, acessado_em DESC);
CREATE INDEX ix_acesso_usuario ON acessos_prontuario (usuario_id, acessado_em DESC);
```

### 6.3 Trigger genérica de auditoria

```sql
CREATE OR REPLACE FUNCTION fn_audit_changes() RETURNS TRIGGER AS $$
DECLARE
  v_diff JSONB;
  v_op   CHAR(1);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'I';
    v_diff := jsonb_build_object('antes', NULL, 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft-delete
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_op := 'S';
    ELSE
      v_op := 'U';
    END IF;
    v_diff := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_op := 'D';
    v_diff := jsonb_build_object('antes', to_jsonb(OLD), 'depois', NULL);
  END IF;

  INSERT INTO auditoria_eventos (
    tenant_id, tabela, registro_id, operacao, diff,
    usuario_id, correlation_id
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_op,
    v_diff,
    NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT,
    NULLIF(current_setting('app.current_correlation_id', TRUE), '')::UUID
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicado a TODAS as tabelas clínicas/financeiras:
-- CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON <tabela>
--   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
```

### 6.4 Criptografia de campos sensíveis

Campos com PHI (Protected Health Information) sensível:

| Tabela | Campo | Estratégia |
|---|---|---|
| `pacientes` | `cpf` | `pgp_sym_encrypt` em coluna `cpf_encrypted` + hash determinístico em `cpf_hash` (para busca) |
| `pacientes` | `cns` | idem |
| `pacientes` | `nome_mae`, `nome_pai` | armazenamento normal (não é segredo médico) |
| `evolucoes` | `conteudo` (JSONB) | TLS em trânsito + criptografia em repouso a nível de tablespace (Postgres TDE via cloud provider) |

Cifragem em coluna usa `pgp_sym_encrypt(valor, key_from_kms)` — chave gerenciada por KMS (AWS KMS, GCP KMS), não no `.env`.

---

## 7. Catálogo completo de tabelas

> Apresentado por **bounded context**. Cada tabela traz: definição completa, índices, constraints, observações.

### 7.1 Identidade & acesso

#### `usuarios`

```sql
CREATE TABLE usuarios (
  id                   BIGSERIAL PRIMARY KEY,
  uuid_externo         UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id            BIGINT NOT NULL REFERENCES tenants(id),
  email                VARCHAR(200) NOT NULL,
  senha_hash           VARCHAR(255),                       -- Argon2id
  mfa_secret           VARCHAR(255),                       -- TOTP, criptografado
  mfa_habilitado       BOOLEAN NOT NULL DEFAULT FALSE,
  prestador_id         BIGINT REFERENCES prestadores(id),  -- se for clínico
  nome                 VARCHAR(300) NOT NULL,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login_em      TIMESTAMPTZ,
  ultimo_login_ip      INET,
  tentativas_login     INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate        TIMESTAMPTZ,
  precisa_trocar_senha BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ,
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT uq_usuarios_email_tenant UNIQUE (tenant_id, email)
);

CREATE INDEX ix_usuarios_tenant ON usuarios(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_usuarios_prestador ON usuarios(prestador_id);
```

#### `perfis`, `permissoes`, `usuarios_perfis`, `perfis_permissoes`

```sql
CREATE TABLE perfis (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id),
  codigo       VARCHAR(50) NOT NULL,           -- ADMIN, MEDICO, ENFERMEIRO, FARMACEUTICO, RECEPCAO, FATURAMENTO, AUDITOR
  nome         VARCHAR(120) NOT NULL,
  descricao    VARCHAR(500),
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_perfis_codigo_tenant UNIQUE (tenant_id, codigo)
);

CREATE TABLE permissoes (
  id        BIGSERIAL PRIMARY KEY,
  recurso   VARCHAR(80) NOT NULL,    -- 'pacientes', 'pep:evolucoes', 'faturamento:tiss'
  acao      VARCHAR(40) NOT NULL,    -- 'read', 'write', 'delete', 'sign', 'fatu'
  descricao VARCHAR(300),
  CONSTRAINT uq_permissoes UNIQUE (recurso, acao)
);

CREATE TABLE usuarios_perfis (
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  perfil_id  BIGINT NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, perfil_id)
);

CREATE TABLE perfis_permissoes (
  perfil_id    BIGINT NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  permissao_id BIGINT NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, permissao_id)
);
```

#### `sessoes_ativas`, `tokens_refresh`

```sql
CREATE TABLE sessoes_ativas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      BIGINT NOT NULL REFERENCES usuarios(id),
  refresh_token_hash VARCHAR(255) NOT NULL,
  ip              INET,
  user_agent      TEXT,
  expira_em       TIMESTAMPTZ NOT NULL,
  revogada_em     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessoes_usuario ON sessoes_ativas(usuario_id) WHERE revogada_em IS NULL;
```

---

### 7.2 Cadastros gerais

#### `pacientes`

```sql
CREATE TABLE pacientes (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id),
  codigo                   VARCHAR(20) NOT NULL,                 -- prontuário interno
  nome                     VARCHAR(300) NOT NULL,
  nome_social              VARCHAR(200),
  cpf_encrypted            BYTEA,
  cpf_hash                 VARCHAR(64) NOT NULL,                 -- SHA-256 de CPF normalizado para busca
  rg                       VARCHAR(20),
  cns                      VARCHAR(20),                          -- Cartão Nacional de Saúde (SUS)
  data_nascimento          DATE NOT NULL,
  sexo                     enum_paciente_sexo NOT NULL,
  tipo_sanguineo           VARCHAR(5),                           -- A+, A-, B+, ...
  nome_mae                 VARCHAR(200) NOT NULL,
  nome_pai                 VARCHAR(200),
  estado_civil             VARCHAR(30),
  profissao                VARCHAR(120),
  raca_cor                 VARCHAR(30),                          -- IBGE
  nacionalidade            VARCHAR(60),
  naturalidade_uf          VARCHAR(2),
  naturalidade_cidade      VARCHAR(100),
  endereco                 JSONB NOT NULL,                       -- {logradouro, numero, complemento, bairro, cidade, uf, cep, pais}
  contatos                 JSONB NOT NULL,                       -- {telefones[], email, contato_emergencia}
  foto_url                 VARCHAR(500),
  alergias                 JSONB,                                -- [{substancia, gravidade, observacao}]
  comorbidades             JSONB,                                -- [{cid, descricao, desde}]
  tipo_atendimento_padrao  enum_paciente_tipo_atendimento_padrao,
  obito                    BOOLEAN NOT NULL DEFAULT FALSE,
  data_obito               DATE,
  causa_obito_cid          VARCHAR(10),
  consentimento_lgpd       BOOLEAN NOT NULL DEFAULT FALSE,
  consentimento_lgpd_em    TIMESTAMPTZ,
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
  CONSTRAINT uq_pacientes_cns_tenant   UNIQUE (tenant_id, cns) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT ck_pacientes_obito CHECK (
    (obito = FALSE AND data_obito IS NULL) OR
    (obito = TRUE  AND data_obito IS NOT NULL AND data_obito <= CURRENT_DATE)
  )
);

CREATE INDEX ix_pacientes_nome_trgm ON pacientes USING gin (unaccent(nome) gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX ix_pacientes_data_nasc ON pacientes (tenant_id, data_nascimento) WHERE deleted_at IS NULL;
CREATE INDEX ix_pacientes_alergias ON pacientes USING gin (alergias jsonb_path_ops);
```

> **Vínculos com convênios** ficam em tabela própria (não JSONB) para integridade.

#### `pacientes_convenios`

```sql
CREATE TABLE pacientes_convenios (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id),
  plano_id            BIGINT REFERENCES planos(id),
  numero_carteirinha  VARCHAR(40) NOT NULL,
  validade            DATE,
  titular             BOOLEAN NOT NULL DEFAULT TRUE,
  parentesco_titular  VARCHAR(40),
  prioridade          INTEGER NOT NULL DEFAULT 1,                -- ordem de uso
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_pac_conv_carteirinha UNIQUE (tenant_id, convenio_id, numero_carteirinha)
);

CREATE INDEX ix_pac_conv_paciente ON pacientes_convenios (paciente_id) WHERE deleted_at IS NULL;
```

#### `prestadores`

```sql
CREATE TABLE prestadores (
  id                 BIGSERIAL PRIMARY KEY,
  uuid_externo       UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id          BIGINT NOT NULL REFERENCES tenants(id),
  nome               VARCHAR(300) NOT NULL,
  nome_social        VARCHAR(200),
  cpf_hash           VARCHAR(64) NOT NULL,
  tipo_conselho      enum_prestador_tipo_conselho NOT NULL,
  numero_conselho    VARCHAR(20) NOT NULL,
  uf_conselho        VARCHAR(2) NOT NULL,
  rqe                VARCHAR(20),                                 -- Registro de Qualificação de Especialista
  tipo_vinculo       enum_prestador_tipo_vinculo NOT NULL,
  recebe_repasse     BOOLEAN NOT NULL DEFAULT TRUE,
  repasse_diaria     BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_taxa       BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_servico    BOOLEAN NOT NULL DEFAULT FALSE,
  repasse_matmed     BOOLEAN NOT NULL DEFAULT FALSE,
  socio_cooperado    BOOLEAN NOT NULL DEFAULT FALSE,
  credenciado_direto JSONB,                                       -- [{convenio_id, observacao}]
  dados_bancarios    JSONB,                                       -- {banco, agencia, conta, tipo, pix}
  cbo_principal      VARCHAR(10),                                 -- CBO 2002
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT uq_prestadores_conselho UNIQUE (tenant_id, tipo_conselho, numero_conselho, uf_conselho)
);

CREATE INDEX ix_prestadores_nome_trgm ON prestadores USING gin (unaccent(nome) gin_trgm_ops);
```

#### `especialidades`, `prestadores_especialidades`

```sql
CREATE TABLE especialidades (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id),
  codigo_cbos VARCHAR(10) NOT NULL,
  nome        VARCHAR(200) NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_especialidades_codigo UNIQUE (tenant_id, codigo_cbos)
);

CREATE TABLE prestadores_especialidades (
  prestador_id     BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE CASCADE,
  especialidade_id BIGINT NOT NULL REFERENCES especialidades(id),
  principal        BOOLEAN NOT NULL DEFAULT FALSE,
  rqe              VARCHAR(20),
  PRIMARY KEY (prestador_id, especialidade_id)
);
```

#### `convenios`, `planos`

```sql
CREATE TABLE convenios (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  codigo          VARCHAR(20) NOT NULL,
  nome            VARCHAR(300) NOT NULL,
  cnpj            VARCHAR(18) NOT NULL,
  registro_ans    VARCHAR(20),
  tipo            enum_convenio_tipo NOT NULL,
  padrao_tiss     BOOLEAN NOT NULL DEFAULT TRUE,
  versao_tiss     VARCHAR(10) NOT NULL DEFAULT '4.01.00',
  url_webservice  VARCHAR(500),                                   -- elegibilidade, autorização
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
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  codigo              VARCHAR(20) NOT NULL,
  nome                VARCHAR(200) NOT NULL,
  registro_ans        VARCHAR(20),
  tipo_acomodacao     enum_leito_tipo_acomodacao,
  segmentacao         VARCHAR(50),                                -- Ambulatorial, Hospitalar, Hosp+Obstetrícia, Referência
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_planos_codigo UNIQUE (convenio_id, codigo)
);
```

#### `condicoes_contratuais`

Versionada — quando muda, cria nova versão. Conta usa snapshot da versão vigente no fechamento.

```sql
CREATE TABLE condicoes_contratuais (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id),
  convenio_id              BIGINT NOT NULL REFERENCES convenios(id),
  plano_id                 BIGINT REFERENCES planos(id),
  versao                   INTEGER NOT NULL DEFAULT 1,
  vigencia_inicio          DATE NOT NULL,
  vigencia_fim             DATE,
  coberturas               JSONB NOT NULL,                        -- procedimentos cobertos
  especialidades_habilitadas JSONB,
  agrupamentos             JSONB,                                 -- códigos de agrupamento TISS
  parametros_tiss          JSONB,                                 -- conf por convênio
  iss_aliquota             DECIMAL(7,4),
  iss_retem                BOOLEAN NOT NULL DEFAULT FALSE,
  exige_autorizacao_internacao BOOLEAN NOT NULL DEFAULT TRUE,
  exige_autorizacao_opme   BOOLEAN NOT NULL DEFAULT TRUE,
  prazo_envio_lote_dias    INTEGER NOT NULL DEFAULT 30,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cc_versao UNIQUE (convenio_id, plano_id, versao),
  CONSTRAINT ck_cc_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);
```

#### `tabelas_precos`, `tabelas_precos_itens`

```sql
CREATE TABLE tabelas_precos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  codigo          VARCHAR(40) NOT NULL,
  nome            VARCHAR(200) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim    DATE,
  versao          INTEGER NOT NULL DEFAULT 1,
  ativa           BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_tp_codigo UNIQUE (tenant_id, codigo, versao)
);

CREATE TABLE tabelas_precos_itens (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT NOT NULL,
  tabela_id          BIGINT NOT NULL REFERENCES tabelas_precos(id) ON DELETE CASCADE,
  procedimento_id    BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  valor              DECIMAL(18,4) NOT NULL,
  valor_filme        DECIMAL(18,4),                                -- exames de imagem
  porte_anestesico   VARCHAR(10),
  tempo_minutos      INTEGER,
  custo_operacional  DECIMAL(18,4),
  observacao         VARCHAR(500),
  CONSTRAINT uq_tpi UNIQUE (tabela_id, procedimento_id),
  CONSTRAINT ck_tpi_valor CHECK (valor >= 0)
);

-- Vínculo convênio × tabela de preços
CREATE TABLE convenios_tabelas_precos (
  convenio_id  BIGINT NOT NULL REFERENCES convenios(id) ON DELETE CASCADE,
  plano_id     BIGINT REFERENCES planos(id),
  tabela_id    BIGINT NOT NULL REFERENCES tabelas_precos(id),
  prioridade   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (convenio_id, COALESCE(plano_id, 0), tabela_id)
);
```

#### `tabelas_procedimentos`

```sql
CREATE TABLE tabelas_procedimentos (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  codigo_tuss         VARCHAR(20) NOT NULL,
  codigo_cbhpm        VARCHAR(20),
  codigo_amb          VARCHAR(20),
  codigo_sus          VARCHAR(20),
  codigo_anvisa       VARCHAR(20),                              -- materiais/medicamentos
  codigo_ean          VARCHAR(20),
  nome                VARCHAR(500) NOT NULL,
  nome_reduzido       VARCHAR(120),
  tipo                enum_procedimento_tipo NOT NULL,
  grupo_gasto         enum_grupo_gasto NOT NULL,
  tabela_tiss         VARCHAR(10),                              -- 22 (TUSS), 18, 19, 20, 98, 00 (própria)
  unidade_medida      VARCHAR(20),                              -- 'CX', 'AMP', 'ML', 'COMP', 'UN'
  fator_conversao     DECIMAL(18,6) DEFAULT 1.0,                -- prescrição → dispensação → faturamento
  valor_referencia    DECIMAL(18,4),
  porte               VARCHAR(10),                              -- CBHPM
  custo_operacional   DECIMAL(18,4),
  precisa_autorizacao BOOLEAN NOT NULL DEFAULT FALSE,
  precisa_assinatura  BOOLEAN NOT NULL DEFAULT FALSE,
  precisa_lote        BOOLEAN NOT NULL DEFAULT FALSE,           -- mat/med
  controlado          BOOLEAN NOT NULL DEFAULT FALSE,           -- portaria 344
  alto_custo          BOOLEAN NOT NULL DEFAULT FALSE,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_proc_tuss UNIQUE (tenant_id, codigo_tuss)
);

CREATE INDEX ix_proc_nome_trgm ON tabelas_procedimentos USING gin (unaccent(nome) gin_trgm_ops);
CREATE INDEX ix_proc_tipo ON tabelas_procedimentos (tenant_id, tipo) WHERE ativo;
```

#### `unidades_faturamento`, `unidades_atendimento`, `centros_custo`, `setores`, `salas_cirurgicas`, `leitos`

```sql
CREATE TABLE unidades_faturamento (
  id        BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id),
  codigo    VARCHAR(20) NOT NULL,
  nome      VARCHAR(120) NOT NULL,
  cnes      VARCHAR(20),
  ativa     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_uf UNIQUE (tenant_id, codigo)
);

CREATE TABLE unidades_atendimento (
  id        BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id),
  codigo    VARCHAR(20) NOT NULL,
  nome      VARCHAR(120) NOT NULL,
  ativa     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_ua UNIQUE (tenant_id, codigo)
);

CREATE TABLE centros_custo (
  id        BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id),
  codigo    VARCHAR(20) NOT NULL,
  nome      VARCHAR(120) NOT NULL,
  parent_id BIGINT REFERENCES centros_custo(id),
  ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_cc UNIQUE (tenant_id, codigo)
);

CREATE TABLE setores (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id),
  nome                     VARCHAR(120) NOT NULL,
  tipo                     enum_setor_tipo NOT NULL,
  unidade_faturamento_id   BIGINT NOT NULL REFERENCES unidades_faturamento(id),
  unidade_atendimento_id   BIGINT NOT NULL REFERENCES unidades_atendimento(id),
  centro_custo_id          BIGINT REFERENCES centros_custo(id),
  capacidade               INTEGER,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_setores_nome UNIQUE (tenant_id, nome)
);

CREATE TABLE salas_cirurgicas (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  setor_id        BIGINT NOT NULL REFERENCES setores(id),
  codigo          VARCHAR(20) NOT NULL,
  nome            VARCHAR(120) NOT NULL,
  tipo            VARCHAR(50),                                 -- ortopédica, geral, hemodinâmica
  status          VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL',
  ativa           BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_salas UNIQUE (tenant_id, codigo)
);

CREATE TABLE leitos (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES tenants(id),
  setor_id          BIGINT NOT NULL REFERENCES setores(id),
  codigo            VARCHAR(20) NOT NULL,
  tipo_acomodacao   enum_leito_tipo_acomodacao NOT NULL,
  status            enum_leito_status NOT NULL DEFAULT 'DISPONIVEL',
  paciente_id       BIGINT REFERENCES pacientes(id),
  atendimento_id    BIGINT REFERENCES atendimentos(id),
  ocupacao_iniciada_em TIMESTAMPTZ,
  ocupacao_prevista_fim TIMESTAMPTZ,
  extra             BOOLEAN NOT NULL DEFAULT FALSE,
  observacao        VARCHAR(500),
  versao            INTEGER NOT NULL DEFAULT 1,                 -- otimistic locking (race condition em alocação)
  CONSTRAINT uq_leitos_codigo UNIQUE (tenant_id, setor_id, codigo),
  CONSTRAINT ck_leitos_ocupacao CHECK (
    (status = 'OCUPADO' AND paciente_id IS NOT NULL AND atendimento_id IS NOT NULL) OR
    (status <> 'OCUPADO')
  ),
  -- Apenas um paciente ocupando um leito ao mesmo tempo (já garantido por status, mas reforço):
  CONSTRAINT uq_leitos_paciente_ativo UNIQUE (paciente_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX ix_leitos_setor_status ON leitos (setor_id, status);
```

> **Race condition em alocação**: o `UPDATE` de leito é feito sob `SELECT ... FOR UPDATE` + checagem de `versao` (otimistic lock). Tentativa de duas alocações simultâneas — uma falha com erro `LeitoConflictError`.

---

### 7.3 Atendimento e Prontuário Eletrônico (PEP)

#### `atendimentos`

```sql
CREATE TABLE atendimentos (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id),
  numero_atendimento       VARCHAR(30) NOT NULL,                  -- humano, sequencial por tenant
  paciente_id              BIGINT NOT NULL REFERENCES pacientes(id),
  tipo                     enum_atendimento_tipo NOT NULL,
  data_hora_entrada        TIMESTAMPTZ NOT NULL,
  data_hora_saida          TIMESTAMPTZ,
  prestador_id             BIGINT NOT NULL REFERENCES prestadores(id),
  setor_id                 BIGINT NOT NULL REFERENCES setores(id),
  unidade_faturamento_id   BIGINT NOT NULL REFERENCES unidades_faturamento(id),
  unidade_atendimento_id   BIGINT NOT NULL REFERENCES unidades_atendimento(id),
  leito_id                 BIGINT REFERENCES leitos(id),
  tipo_cobranca            enum_tipo_cobranca NOT NULL,
  paciente_convenio_id     BIGINT REFERENCES pacientes_convenios(id),
  convenio_id              BIGINT REFERENCES convenios(id),
  plano_id                 BIGINT REFERENCES planos(id),
  numero_carteirinha       VARCHAR(40),
  numero_guia_operadora    VARCHAR(40),
  senha_autorizacao        VARCHAR(40),
  classificacao_risco      enum_atendimento_classificacao_risco,
  classificacao_risco_em   TIMESTAMPTZ,
  classificacao_risco_por  BIGINT,                                 -- usuario_id
  cid_principal            VARCHAR(10),
  cids_secundarios         JSONB,
  motivo_atendimento       VARCHAR(500),
  tipo_alta                enum_atendimento_tipo_alta,
  status                   enum_atendimento_status NOT NULL,
  conta_id                 BIGINT,                                  -- FK lógica → contas (1:1)
  agendamento_id           BIGINT REFERENCES agendamentos(id),
  atendimento_origem_id    BIGINT REFERENCES atendimentos(id),     -- transferência, encaminhamento
  observacao               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  updated_at               TIMESTAMPTZ,
  updated_by               BIGINT,
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT,
  versao                   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_atendimentos_numero UNIQUE (tenant_id, numero_atendimento),
  CONSTRAINT ck_atendimentos_saida CHECK (data_hora_saida IS NULL OR data_hora_saida >= data_hora_entrada),
  CONSTRAINT ck_atendimentos_conv CHECK (
    (tipo_cobranca = 'CONVENIO' AND convenio_id IS NOT NULL AND numero_carteirinha IS NOT NULL) OR
    (tipo_cobranca <> 'CONVENIO')
  )
);

CREATE INDEX ix_atend_paciente_data ON atendimentos (paciente_id, data_hora_entrada DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_atend_setor_status ON atendimentos (setor_id, status);
CREATE INDEX ix_atend_prestador ON atendimentos (prestador_id, data_hora_entrada DESC);
CREATE INDEX ix_atend_convenio ON atendimentos (convenio_id, data_hora_entrada DESC) WHERE convenio_id IS NOT NULL;
```

#### `evolucoes` (particionada por mês)

```sql
CREATE TABLE evolucoes (
  id                      BIGSERIAL,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  atendimento_id          BIGINT NOT NULL,
  paciente_id             BIGINT NOT NULL,
  profissional_id         BIGINT NOT NULL,
  tipo_profissional       enum_evolucao_tipo_profissional NOT NULL,
  tipo                    enum_evolucao_tipo NOT NULL,
  data_hora               TIMESTAMPTZ NOT NULL,
  conteudo                JSONB NOT NULL,                          -- estrutura por tipo (anamnese, exame, etc.)
  texto_livre             TEXT,                                    -- texto plano para indexação
  cids                    JSONB,
  sinais_vitais           JSONB,                                   -- {pa_sistolica, pa_diastolica, fc, fr, temp, sat_o2, peso, altura, glicemia}
  assinatura_digital_id   VARCHAR(120),
  assinada_em             TIMESTAMPTZ,
  versao_anterior_id      BIGINT,                                  -- correções
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT NOT NULL,
  PRIMARY KEY (id, data_hora)                                       -- partitioning column é parte da PK
) PARTITION BY RANGE (data_hora);

-- Partições mensais (criação automatizada por job):
CREATE TABLE evolucoes_2026_03 PARTITION OF evolucoes
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX ix_evol_atend ON evolucoes (atendimento_id, data_hora DESC);
CREATE INDEX ix_evol_paciente ON evolucoes (paciente_id, data_hora DESC);
CREATE INDEX ix_evol_profissional ON evolucoes (profissional_id, data_hora DESC);
CREATE INDEX ix_evol_texto_trgm ON evolucoes USING gin (texto_livre gin_trgm_ops);
```

> Imutabilidade: trigger `tg_evolucoes_imutavel_apos_assinatura` bloqueia UPDATE/DELETE quando `assinada_em IS NOT NULL`.

#### `prescricoes` e `prescricoes_itens`

```sql
CREATE TABLE prescricoes (
  id                      BIGSERIAL,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  atendimento_id          BIGINT NOT NULL REFERENCES atendimentos(id),
  paciente_id             BIGINT NOT NULL,
  prescritor_id           BIGINT NOT NULL REFERENCES prestadores(id),
  data_hora               TIMESTAMPTZ NOT NULL,
  tipo                    enum_prescricao_tipo NOT NULL,
  validade_inicio         TIMESTAMPTZ NOT NULL,
  validade_fim            TIMESTAMPTZ,
  status                  enum_prescricao_status NOT NULL DEFAULT 'AGUARDANDO_ANALISE',
  prescricao_anterior_id  BIGINT,
  observacao_geral        TEXT,
  assinatura_digital_id   VARCHAR(120),
  assinada_em             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, data_hora)
) PARTITION BY RANGE (data_hora);

CREATE TABLE prescricoes_itens (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  prescricao_id       BIGINT NOT NULL,
  prescricao_data_hora TIMESTAMPTZ NOT NULL,                       -- composta com prescricoes
  procedimento_id     BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  quantidade          DECIMAL(18,6) NOT NULL,
  unidade_medida      VARCHAR(20),
  dose                VARCHAR(50),                                  -- "500mg", "10mL"
  via                 VARCHAR(40),                                  -- "VO", "EV", "IM", "SC"
  frequencia          VARCHAR(50),                                  -- "8/8h", "12/12h", "SOS"
  horarios            JSONB,                                        -- ["06:00","14:00","22:00"]
  duracao_dias        INTEGER,
  urgente             BOOLEAN NOT NULL DEFAULT FALSE,
  se_necessario       BOOLEAN NOT NULL DEFAULT FALSE,
  observacao          VARCHAR(500),
  alerta_alergia      JSONB,                                        -- {detectada, justificativa}
  alerta_interacao    JSONB,
  alerta_dose_max     JSONB,
  status_item         VARCHAR(30) NOT NULL DEFAULT 'ATIVO',         -- ATIVO, SUSPENSO, ENCERRADO, RECUSADO
  CONSTRAINT ck_psi_qtd CHECK (quantidade > 0)
);

CREATE INDEX ix_pi_prescricao ON prescricoes_itens (prescricao_id);
CREATE INDEX ix_pi_proc ON prescricoes_itens (procedimento_id);
```

#### `analises_farmaceuticas`

```sql
CREATE TABLE analises_farmaceuticas (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  prescricao_id       BIGINT NOT NULL,
  prescricao_data_hora TIMESTAMPTZ NOT NULL,
  farmaceutico_id     BIGINT NOT NULL REFERENCES prestadores(id),
  status              enum_analise_farmaceutica_status NOT NULL,
  parecer             TEXT,
  ressalvas           JSONB,                                        -- por item
  data_hora           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT NOT NULL
);
```

#### `solicitacoes_exame` e `solicitacoes_exame_itens`, `resultados_exame`

```sql
CREATE TABLE solicitacoes_exame (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  atendimento_id    BIGINT NOT NULL REFERENCES atendimentos(id),
  paciente_id       BIGINT NOT NULL,
  solicitante_id    BIGINT NOT NULL REFERENCES prestadores(id),
  urgencia          enum_solicitacao_exame_urgencia NOT NULL DEFAULT 'ROTINA',
  indicacao_clinica TEXT,
  numero_guia       VARCHAR(30),
  status            enum_solicitacao_exame_status NOT NULL DEFAULT 'SOLICITADO',
  data_solicitacao  TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_realizacao   TIMESTAMPTZ,
  laboratorio_apoio_id BIGINT REFERENCES laboratorios_apoio(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE solicitacoes_exame_itens (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  solicitacao_id    BIGINT NOT NULL REFERENCES solicitacoes_exame(id) ON DELETE CASCADE,
  procedimento_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  observacao        VARCHAR(500),
  status            enum_solicitacao_exame_status NOT NULL DEFAULT 'SOLICITADO',
  resultado_id      BIGINT REFERENCES resultados_exame(id)
);

CREATE TABLE resultados_exame (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  solicitacao_item_id BIGINT NOT NULL,
  paciente_id         BIGINT NOT NULL,
  data_coleta         TIMESTAMPTZ,
  data_processamento  TIMESTAMPTZ,
  data_laudo          TIMESTAMPTZ,
  laudista_id         BIGINT REFERENCES prestadores(id),
  laudo_estruturado   JSONB,                                        -- valores de referência, valores medidos
  laudo_texto         TEXT,
  laudo_pdf_url       VARCHAR(500),
  imagens_urls        JSONB,                                        -- DICOM/JPG
  status              enum_solicitacao_exame_status NOT NULL,
  assinatura_digital_id VARCHAR(120),
  assinado_em         TIMESTAMPTZ,
  versao_anterior_id  BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `documentos_emitidos` (atestados, receitas, declarações)

```sql
CREATE TABLE documentos_emitidos (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  atendimento_id      BIGINT REFERENCES atendimentos(id),
  paciente_id         BIGINT NOT NULL,
  emissor_id          BIGINT NOT NULL REFERENCES prestadores(id),
  tipo                VARCHAR(40) NOT NULL,        -- ATESTADO, RECEITA_SIMPLES, RECEITA_CONTROLADO, DECLARACAO, ENCAMINHAMENTO, RESUMO_ALTA
  conteudo            JSONB NOT NULL,
  pdf_url             VARCHAR(500),
  assinatura_digital_id VARCHAR(120),
  assinado_em         TIMESTAMPTZ,
  data_emissao        TIMESTAMPTZ NOT NULL DEFAULT now(),
  validade_dias       INTEGER
);
```

---

### 7.4 Agendamento

```sql
CREATE TABLE agendas_recursos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  tipo            VARCHAR(30) NOT NULL,                           -- PRESTADOR, SALA, EQUIPAMENTO
  prestador_id    BIGINT REFERENCES prestadores(id),
  sala_id         BIGINT REFERENCES salas_cirurgicas(id),
  equipamento_id  BIGINT,
  intervalo_minutos INTEGER NOT NULL DEFAULT 30,
  permite_encaixe BOOLEAN NOT NULL DEFAULT TRUE,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE agendas_disponibilidade (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  recurso_id      BIGINT NOT NULL REFERENCES agendas_recursos(id),
  dia_semana      INTEGER,                                        -- 0=domingo
  data_especifica DATE,
  hora_inicio     TIME NOT NULL,
  hora_fim        TIME NOT NULL,
  vigencia_inicio DATE,
  vigencia_fim    DATE,
  CONSTRAINT ck_ad_dia_ou_data CHECK (dia_semana IS NOT NULL OR data_especifica IS NOT NULL)
);

CREATE TABLE agendas_bloqueios (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  recurso_id      BIGINT NOT NULL REFERENCES agendas_recursos(id),
  inicio          TIMESTAMPTZ NOT NULL,
  fim             TIMESTAMPTZ NOT NULL,
  motivo          VARCHAR(200),
  CONSTRAINT ck_ab_periodo CHECK (fim > inicio)
);

CREATE TABLE agendamentos (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id),
  recurso_id          BIGINT NOT NULL REFERENCES agendas_recursos(id),
  procedimento_id     BIGINT REFERENCES tabelas_procedimentos(id),
  inicio              TIMESTAMPTZ NOT NULL,
  fim                 TIMESTAMPTZ NOT NULL,
  tipo                enum_atendimento_tipo NOT NULL,
  status              VARCHAR(30) NOT NULL DEFAULT 'AGENDADO',     -- AGENDADO, CONFIRMADO, COMPARECEU, FALTOU, CANCELADO, REAGENDADO
  origem              VARCHAR(30) NOT NULL DEFAULT 'INTERNO',      -- INTERNO, PORTAL, TOTEM, TELEFONE
  encaixe             BOOLEAN NOT NULL DEFAULT FALSE,
  convenio_id         BIGINT REFERENCES convenios(id),
  observacao          VARCHAR(500),
  link_teleconsulta   VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT,
  CONSTRAINT ck_agend_periodo CHECK (fim > inicio),
  -- Sem sobreposição de horários para o mesmo recurso (exceto encaixes):
  CONSTRAINT xc_agend_overlap EXCLUDE USING gist (
    recurso_id WITH =,
    tstzrange(inicio, fim, '[)') WITH &&
  ) WHERE (status NOT IN ('CANCELADO', 'REAGENDADO') AND encaixe = FALSE)
);

CREATE INDEX ix_agend_recurso_inicio ON agendamentos (recurso_id, inicio);
CREATE INDEX ix_agend_paciente ON agendamentos (paciente_id, inicio DESC);
```

> A constraint `EXCLUDE USING gist` impede overbooking automaticamente — banco rejeita insert conflitante.

---

### 7.5 Faturamento e Conta do Paciente

#### `contas`

```sql
CREATE TABLE contas (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  numero_conta             VARCHAR(30) NOT NULL,
  atendimento_id           BIGINT NOT NULL REFERENCES atendimentos(id),
  paciente_id              BIGINT NOT NULL REFERENCES pacientes(id),
  convenio_id              BIGINT REFERENCES convenios(id),
  plano_id                 BIGINT REFERENCES planos(id),
  tipo_cobranca            enum_tipo_cobranca NOT NULL,
  data_abertura            TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fechamento          TIMESTAMPTZ,
  data_envio               TIMESTAMPTZ,
  -- Snapshots:
  versao_tiss_snapshot     VARCHAR(10),
  condicao_contratual_snap JSONB,
  tabela_precos_snap       JSONB,
  -- Totais:
  valor_procedimentos      DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_diarias            DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_taxas              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_servicos           DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_materiais          DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_medicamentos       DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_opme               DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_gases              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_pacotes            DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_honorarios         DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_total              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_glosa              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_recurso_revertido  DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_pago               DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_liquido            DECIMAL(18,4) NOT NULL DEFAULT 0,
  iss_aliquota_snap        DECIMAL(7,4),
  iss_valor                DECIMAL(18,4),
  numero_guia_principal    VARCHAR(30),
  status                   enum_conta_status NOT NULL DEFAULT 'ABERTA',
  observacao_elaboracao    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ,
  versao                   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_contas_numero UNIQUE (tenant_id, numero_conta),
  CONSTRAINT ck_contas_total CHECK (valor_total >= 0),
  CONSTRAINT ck_contas_liquido CHECK (valor_liquido = valor_total - valor_glosa + valor_recurso_revertido)
);

CREATE INDEX ix_contas_atend ON contas (atendimento_id);
CREATE INDEX ix_contas_status ON contas (tenant_id, status);
CREATE INDEX ix_contas_convenio_data ON contas (convenio_id, data_fechamento) WHERE convenio_id IS NOT NULL;
```

#### `contas_itens`

```sql
CREATE TABLE contas_itens (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL,
  conta_id                 BIGINT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  procedimento_id          BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  grupo_gasto              enum_grupo_gasto NOT NULL,
  origem                   enum_conta_origem_item NOT NULL,
  origem_referencia_id     BIGINT,                                  -- prescricao_id, cirurgia_id, etc.
  quantidade               DECIMAL(18,6) NOT NULL,
  valor_unitario           DECIMAL(18,6) NOT NULL,
  valor_total              DECIMAL(18,4) NOT NULL,
  prestador_executante_id  BIGINT REFERENCES prestadores(id),
  data_realizacao          TIMESTAMPTZ,
  setor_id                 BIGINT REFERENCES setores(id),
  -- Faturamento e autorização:
  autorizado               BOOLEAN NOT NULL DEFAULT FALSE,
  numero_autorizacao       VARCHAR(40),
  fora_pacote              BOOLEAN NOT NULL DEFAULT FALSE,
  pacote_id                BIGINT REFERENCES pacotes(id),
  -- OPME / lote:
  lote                     VARCHAR(50),
  validade_lote            DATE,
  registro_anvisa          VARCHAR(40),
  fabricante               VARCHAR(200),
  -- Glosa:
  glosado                  BOOLEAN NOT NULL DEFAULT FALSE,
  valor_glosa              DECIMAL(18,4) NOT NULL DEFAULT 0,
  -- TISS:
  guia_tiss_id             BIGINT REFERENCES guias_tiss(id),
  tabela_tiss_origem       VARCHAR(10),                              -- snapshot da tabela aplicada
  -- Audit:
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  CONSTRAINT ck_ci_qtd CHECK (quantidade > 0),
  CONSTRAINT ck_ci_total CHECK (valor_total >= 0)
);

CREATE INDEX ix_ci_conta ON contas_itens (conta_id);
CREATE INDEX ix_ci_proc ON contas_itens (procedimento_id);
CREATE INDEX ix_ci_grupo ON contas_itens (conta_id, grupo_gasto);
CREATE INDEX ix_ci_executante ON contas_itens (prestador_executante_id, data_realizacao DESC);
```

#### `pacotes`, `pacotes_itens`

```sql
CREATE TABLE pacotes (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  codigo            VARCHAR(40) NOT NULL,
  nome              VARCHAR(300) NOT NULL,
  procedimento_principal_id BIGINT REFERENCES tabelas_procedimentos(id),
  valor_total       DECIMAL(18,4) NOT NULL,
  vigencia_inicio   DATE NOT NULL,
  vigencia_fim      DATE,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_pacotes UNIQUE (tenant_id, codigo)
);

CREATE TABLE pacotes_itens (
  pacote_id        BIGINT NOT NULL REFERENCES pacotes(id) ON DELETE CASCADE,
  procedimento_id  BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  quantidade       DECIMAL(18,6) NOT NULL DEFAULT 1,
  faixa_inicio     VARCHAR(20),                                    -- código mínimo da faixa, se aplicável
  faixa_fim        VARCHAR(20),
  PRIMARY KEY (pacote_id, procedimento_id)
);
```

#### `guias_tiss`, `lotes_tiss`

```sql
CREATE TABLE lotes_tiss (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id),
  numero_lote         VARCHAR(20) NOT NULL,
  versao_tiss         VARCHAR(10) NOT NULL,
  competencia         VARCHAR(7) NOT NULL,                          -- AAAA-MM
  data_geracao        TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_envio          TIMESTAMPTZ,
  qtd_guias           INTEGER NOT NULL DEFAULT 0,
  valor_total         DECIMAL(18,4) NOT NULL DEFAULT 0,
  hash_xml            VARCHAR(64),                                  -- SHA-256
  xml_url             VARCHAR(500),                                 -- S3
  protocolo_operadora VARCHAR(40),
  status              enum_lote_tiss_status NOT NULL DEFAULT 'EM_PREPARACAO',
  lote_anterior_id    BIGINT REFERENCES lotes_tiss(id),             -- reenvio
  CONSTRAINT uq_lote UNIQUE (tenant_id, convenio_id, numero_lote)
);

CREATE TABLE guias_tiss (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  conta_id                 BIGINT NOT NULL REFERENCES contas(id),
  lote_id                  BIGINT REFERENCES lotes_tiss(id),
  tipo_guia                enum_guia_tiss_tipo NOT NULL,
  versao_tiss              VARCHAR(10) NOT NULL,
  numero_guia_prestador    VARCHAR(30) NOT NULL,
  numero_guia_operadora    VARCHAR(30),
  senha_autorizacao        VARCHAR(40),
  xml_conteudo             TEXT,
  hash_xml                 VARCHAR(64),
  valor_total              DECIMAL(18,4) NOT NULL DEFAULT 0,
  status                   enum_guia_tiss_status NOT NULL DEFAULT 'GERADA',
  validacao_xsd_status     VARCHAR(20),                              -- OK, ERRO
  validacao_xsd_erros      JSONB,
  data_geracao             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_guias_numero UNIQUE (tenant_id, numero_guia_prestador)
);

CREATE INDEX ix_guias_lote ON guias_tiss (lote_id);
CREATE INDEX ix_guias_status ON guias_tiss (status);
```

#### `glosas`

```sql
CREATE TABLE glosas (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  conta_id            BIGINT NOT NULL REFERENCES contas(id),
  conta_item_id       BIGINT REFERENCES contas_itens(id),
  guia_tiss_id        BIGINT REFERENCES guias_tiss(id),
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id),
  motivo              VARCHAR(500) NOT NULL,
  codigo_glosa_tiss   VARCHAR(10),
  valor_glosado       DECIMAL(18,4) NOT NULL,
  data_glosa          DATE NOT NULL,
  origem              VARCHAR(20) NOT NULL DEFAULT 'TISS',          -- TISS, MANUAL
  -- Recurso:
  recurso             TEXT,
  data_recurso        DATE,
  recurso_documento_url VARCHAR(500),
  status              enum_glosa_status NOT NULL DEFAULT 'RECEBIDA',
  valor_revertido     DECIMAL(18,4) NOT NULL DEFAULT 0,
  data_resposta_recurso DATE,
  motivo_resposta     VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_glosas_conta ON glosas (conta_id);
CREATE INDEX ix_glosas_status ON glosas (status, data_glosa);
```

#### `criterios_repasse`

```sql
CREATE TABLE criterios_repasse (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL,
  descricao                VARCHAR(200) NOT NULL,
  vigencia_inicio          DATE NOT NULL,
  vigencia_fim             DATE,
  unidade_faturamento_id   BIGINT REFERENCES unidades_faturamento(id),
  unidade_atendimento_id   BIGINT REFERENCES unidades_atendimento(id),
  tipo_base_calculo        enum_repasse_tipo_base_calculo NOT NULL,
  momento_repasse          enum_repasse_momento NOT NULL,
  dia_fechamento           INTEGER,
  prazo_dias               INTEGER,
  prioridade               INTEGER NOT NULL DEFAULT 1,
  regras                   JSONB NOT NULL,                          -- snapshot completo das regras
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Estrutura de regras (validada por JSON Schema na aplicação):
-- {
--   "matchers": [
--     { "prestador_id": 123 },
--     { "funcao": "ANESTESISTA", "convenio_id": 5, "percentual": 80.0 },
--     { "grupo_gasto": "MATERIAL", "valor_fixo": 0 },
--     { "faixa_procedimento": ["10101012","10101015"], "percentual": 65.0 }
--   ],
--   "deducoes": [...],
--   "acrescimos": [...]
-- }
```

#### `repasses`, `repasses_itens`

```sql
CREATE TABLE repasses (
  id                 BIGSERIAL PRIMARY KEY,
  tenant_id          BIGINT NOT NULL,
  prestador_id       BIGINT NOT NULL REFERENCES prestadores(id),
  competencia        VARCHAR(7) NOT NULL,                            -- AAAA-MM
  data_apuracao      TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_liberacao     TIMESTAMPTZ,
  data_pagamento     TIMESTAMPTZ,
  valor_bruto        DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_creditos     DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_debitos      DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_descontos    DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_impostos     DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_liquido      DECIMAL(18,4) NOT NULL DEFAULT 0,
  status             enum_repasse_status NOT NULL DEFAULT 'APURADO',
  observacao         TEXT,
  CONSTRAINT uq_repasse UNIQUE (tenant_id, prestador_id, competencia)
);

CREATE TABLE repasses_itens (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  repasse_id          BIGINT NOT NULL REFERENCES repasses(id) ON DELETE CASCADE,
  conta_id            BIGINT NOT NULL REFERENCES contas(id),
  conta_item_id       BIGINT REFERENCES contas_itens(id),
  criterio_id         BIGINT REFERENCES criterios_repasse(id),
  funcao              VARCHAR(40),                                   -- CIRURGIAO, ANESTESISTA, AUXILIAR, INSTRUMENTADOR
  base_calculo        DECIMAL(18,4) NOT NULL,
  percentual          DECIMAL(7,4),
  valor_fixo          DECIMAL(18,4),
  valor_calculado     DECIMAL(18,4) NOT NULL,
  glosado             BOOLEAN NOT NULL DEFAULT FALSE,
  observacao          VARCHAR(500)
);

CREATE INDEX ix_ri_repasse ON repasses_itens (repasse_id);
CREATE INDEX ix_ri_conta ON repasses_itens (conta_id);
```

---

### 7.6 Farmácia

#### `dispensacoes`, `dispensacoes_itens`

```sql
CREATE TABLE dispensacoes (
  id                  BIGSERIAL,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  atendimento_id      BIGINT NOT NULL,
  paciente_id         BIGINT NOT NULL,
  prescricao_id       BIGINT,                                       -- pode ser avulsa
  prescricao_data_hora TIMESTAMPTZ,
  farmaceutico_id     BIGINT NOT NULL REFERENCES prestadores(id),
  setor_destino_id    BIGINT REFERENCES setores(id),
  data_hora           TIMESTAMPTZ NOT NULL,
  turno               VARCHAR(20),                                  -- MANHA, TARDE, NOITE, MADRUGADA
  tipo                enum_dispensacao_tipo NOT NULL,
  status              enum_dispensacao_status NOT NULL DEFAULT 'PENDENTE',
  observacao          VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, data_hora)
) PARTITION BY RANGE (data_hora);

CREATE TABLE dispensacoes_itens (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL,
  dispensacao_id           BIGINT NOT NULL,
  dispensacao_data_hora    TIMESTAMPTZ NOT NULL,
  procedimento_id          BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  prescricao_item_id       BIGINT,
  quantidade_prescrita     DECIMAL(18,6) NOT NULL,
  quantidade_dispensada    DECIMAL(18,6) NOT NULL,
  unidade_medida           VARCHAR(20),
  lote                     VARCHAR(50),
  validade                 DATE,
  conta_item_id            BIGINT REFERENCES contas_itens(id),       -- vínculo com faturamento
  status                   enum_dispensacao_status NOT NULL DEFAULT 'PENDENTE',
  CONSTRAINT ck_di_qtd CHECK (quantidade_dispensada >= 0)
);
```

#### `livro_controlados`

```sql
CREATE TABLE livro_controlados (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  data_hora         TIMESTAMPTZ NOT NULL,
  procedimento_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  lote              VARCHAR(50) NOT NULL,
  quantidade        DECIMAL(18,6) NOT NULL,
  saldo_anterior    DECIMAL(18,6) NOT NULL,
  saldo_atual       DECIMAL(18,6) NOT NULL,
  tipo_movimento    VARCHAR(20) NOT NULL,                          -- ENTRADA, SAIDA, AJUSTE, PERDA
  paciente_id       BIGINT REFERENCES pacientes(id),
  prescricao_id     BIGINT,
  receita_documento_url VARCHAR(500),                              -- receita controlado (B1, B2, A1, A2, A3)
  farmaceutico_id   BIGINT NOT NULL REFERENCES prestadores(id),
  observacao        VARCHAR(500)
);

CREATE INDEX ix_livro_proc_data ON livro_controlados (procedimento_id, data_hora DESC);
```

---

### 7.7 Centro Cirúrgico

#### `cirurgias`, `cirurgias_equipe`

```sql
CREATE TABLE cirurgias (
  id                          BIGSERIAL PRIMARY KEY,
  uuid_externo                UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                   BIGINT NOT NULL,
  atendimento_id              BIGINT NOT NULL REFERENCES atendimentos(id),
  paciente_id                 BIGINT NOT NULL,
  procedimento_principal_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  procedimentos_secundarios   JSONB,
  sala_id                     BIGINT NOT NULL REFERENCES salas_cirurgicas(id),
  data_hora_agendada          TIMESTAMPTZ NOT NULL,
  duracao_estimada_minutos    INTEGER,
  data_hora_inicio            TIMESTAMPTZ,
  data_hora_fim               TIMESTAMPTZ,
  cirurgiao_id                BIGINT NOT NULL REFERENCES prestadores(id),
  tipo_anestesia              enum_cirurgia_tipo_anestesia,
  classificacao_cirurgia      enum_cirurgia_classificacao,
  kit_cirurgico_id            BIGINT REFERENCES kits_cirurgicos(id),
  caderno_gabarito_id         BIGINT REFERENCES cadernos_gabaritos(id),
  ficha_cirurgica             JSONB,                                 -- descrição cirúrgica
  ficha_anestesica            JSONB,                                 -- Anestech ou própria
  intercorrencias             TEXT,
  status                      enum_cirurgia_status NOT NULL DEFAULT 'AGENDADA',
  conta_id                    BIGINT REFERENCES contas(id),
  -- OPME:
  opme_solicitada             JSONB,
  opme_autorizada             JSONB,
  opme_utilizada              JSONB,
  -- Audit:
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Sem sobreposição na sala (rejeita conflito):
  CONSTRAINT xc_cirurgias_sala EXCLUDE USING gist (
    sala_id WITH =,
    tstzrange(data_hora_inicio, data_hora_fim, '[)') WITH &&
  ) WHERE (status IN ('CONFIRMADA','EM_ANDAMENTO','CONCLUIDA'))
);

CREATE TABLE cirurgias_equipe (
  cirurgia_id   BIGINT NOT NULL REFERENCES cirurgias(id) ON DELETE CASCADE,
  prestador_id  BIGINT NOT NULL REFERENCES prestadores(id),
  funcao        VARCHAR(40) NOT NULL,                                -- CIRURGIAO, AUXILIAR_1, AUXILIAR_2, ANESTESISTA, INSTRUMENTADOR
  ordem         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (cirurgia_id, prestador_id, funcao)
);
```

#### `kits_cirurgicos`, `kits_cirurgicos_itens`, `cadernos_gabaritos`, `cadernos_gabaritos_itens`

```sql
CREATE TABLE kits_cirurgicos (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  codigo       VARCHAR(40) NOT NULL,
  nome         VARCHAR(200) NOT NULL,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_kits UNIQUE (tenant_id, codigo)
);

CREATE TABLE kits_cirurgicos_itens (
  kit_id          BIGINT NOT NULL REFERENCES kits_cirurgicos(id) ON DELETE CASCADE,
  procedimento_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  quantidade      DECIMAL(18,6) NOT NULL,
  PRIMARY KEY (kit_id, procedimento_id)
);

CREATE TABLE cadernos_gabaritos (
  id                       BIGSERIAL PRIMARY KEY,
  tenant_id                BIGINT NOT NULL,
  procedimento_principal_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  cirurgiao_id             BIGINT REFERENCES prestadores(id),         -- gabarito por cirurgião (opcional)
  versao                   INTEGER NOT NULL DEFAULT 1,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_cg UNIQUE (tenant_id, procedimento_principal_id, COALESCE(cirurgiao_id,0), versao)
);

CREATE TABLE cadernos_gabaritos_itens (
  caderno_id      BIGINT NOT NULL REFERENCES cadernos_gabaritos(id) ON DELETE CASCADE,
  procedimento_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id),
  quantidade_padrao DECIMAL(18,6) NOT NULL,
  obrigatorio     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (caderno_id, procedimento_id)
);
```

---

### 7.8 CME

```sql
CREATE TABLE cme_lotes (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  numero              VARCHAR(40) NOT NULL,
  metodo              enum_cme_metodo_esterilizacao NOT NULL,
  data_esterilizacao  TIMESTAMPTZ NOT NULL,
  validade            DATE NOT NULL,
  responsavel_id      BIGINT NOT NULL REFERENCES prestadores(id),
  indicador_biologico_url VARCHAR(500),
  indicador_quimico_ok BOOLEAN,
  indicador_biologico_ok BOOLEAN,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_cme_lote UNIQUE (tenant_id, numero)
);

CREATE TABLE cme_artigos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  lote_id         BIGINT NOT NULL REFERENCES cme_lotes(id),
  codigo_artigo   VARCHAR(60) NOT NULL,
  descricao       VARCHAR(300),
  etapa_atual     enum_cme_etapa NOT NULL DEFAULT 'RECEPCAO',
  cirurgia_id     BIGINT REFERENCES cirurgias(id),
  paciente_id     BIGINT REFERENCES pacientes(id),                    -- rastreabilidade
  ultima_movimentacao TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cme_movimentacoes (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  artigo_id       BIGINT NOT NULL REFERENCES cme_artigos(id),
  etapa_origem    enum_cme_etapa,
  etapa_destino   enum_cme_etapa NOT NULL,
  responsavel_id  BIGINT NOT NULL REFERENCES prestadores(id),
  data_hora       TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao      VARCHAR(500)
);
```

---

### 7.9 CCIH

```sql
CREATE TABLE ccih_casos (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           BIGINT NOT NULL,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id),
  atendimento_id      BIGINT NOT NULL REFERENCES atendimentos(id),
  setor_id            BIGINT NOT NULL REFERENCES setores(id),
  leito_id            BIGINT REFERENCES leitos(id),
  data_diagnostico    DATE NOT NULL,
  topografia          VARCHAR(80),                                   -- IRAS: respiratória, urinária, sítio cirúrgico, corrente sanguínea
  cid                 VARCHAR(10),
  microorganismo      VARCHAR(120),
  cultura_origem      VARCHAR(80),
  resistencia         JSONB,                                         -- antibiograma
  origem_infeccao     VARCHAR(40),                                   -- COMUNITARIA, HOSPITALAR
  resultado           VARCHAR(40),                                   -- CURA, OBITO, ALTA_COM_INFECCAO
  status              VARCHAR(30) NOT NULL DEFAULT 'ABERTO',
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_ccih_paciente ON ccih_casos (paciente_id, data_diagnostico DESC);
```

---

### 7.10 SAME (Arquivo de Prontuários)

```sql
CREATE TABLE same_prontuarios (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  paciente_id       BIGINT NOT NULL REFERENCES pacientes(id),
  numero_pasta      VARCHAR(40) NOT NULL,
  localizacao       VARCHAR(200),                                    -- ex.: "ARMARIO 5, ESTANTE 3"
  status            VARCHAR(30) NOT NULL DEFAULT 'ARQUIVADO',        -- ARQUIVADO, EMPRESTADO, DIGITALIZADO, DESCARTADO
  digitalizado      BOOLEAN NOT NULL DEFAULT FALSE,
  pdf_legado_url    VARCHAR(500),
  CONSTRAINT uq_pasta UNIQUE (tenant_id, numero_pasta)
);

CREATE TABLE same_emprestimos (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  prontuario_id   BIGINT NOT NULL REFERENCES same_prontuarios(id),
  solicitante_id  BIGINT NOT NULL,
  data_emprestimo TIMESTAMPTZ NOT NULL,
  data_devolucao_prevista DATE,
  data_devolucao_real  TIMESTAMPTZ,
  motivo          VARCHAR(200)
);
```

---

### 7.11 Visitantes

```sql
CREATE TABLE visitantes (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  nome            VARCHAR(300) NOT NULL,
  cpf_hash        VARCHAR(64) NOT NULL,
  documento_foto_url VARCHAR(500),
  bloqueado       BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueio VARCHAR(200),
  CONSTRAINT uq_visitante_cpf UNIQUE (tenant_id, cpf_hash)
);

CREATE TABLE visitas (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  visitante_id    BIGINT NOT NULL REFERENCES visitantes(id),
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id),
  leito_id        BIGINT REFERENCES leitos(id),
  data_entrada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_saida      TIMESTAMPTZ,
  porteiro_id     BIGINT,
  observacao      VARCHAR(500)
);

CREATE INDEX ix_visitas_paciente ON visitas (paciente_id, data_entrada DESC);
```

---

### 7.12 Outras tabelas auxiliares

- `laboratorios_apoio` (catálogo de labs externos)
- `equipamentos` (mamógrafo, raio-x, etc., para agenda multirecurso)
- `outbox_events` (outbox pattern para Redis Streams)
- `notificacoes` (push, e-mail, SMS)
- `arquivos` (centralizada — todos os PDFs/imagens passam por aqui, ficam em S3-compat)

```sql
CREATE TABLE outbox_events (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT,
  aggregate_type  VARCHAR(80) NOT NULL,
  aggregate_id    BIGINT NOT NULL,
  event_type      VARCHAR(120) NOT NULL,
  payload         JSONB NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
);

CREATE INDEX ix_outbox_pending ON outbox_events (occurred_at) WHERE published_at IS NULL;
```

---

## 8. Índices e performance

### 8.1 Princípios de indexação

- **Partial indexes** com `WHERE deleted_at IS NULL` em colunas muito consultadas (economiza espaço e acelera).
- **GIN** em todos os JSONB consultáveis (alergias do paciente, conteúdo de evolução).
- **Trigram (`gin_trgm_ops`)** em buscas de nome/descrição.
- **Composite indexes** seguem ordem das colunas pelo seletividade (mais seletiva primeiro).
- Toda FK tem índice (sempre).
- Colunas com `enum` muito desbalanceado (ex.: status) ganham índice **parcial** apenas nos valores quentes (ex.: `WHERE status IN ('ABERTA','EM_ELABORACAO')`).

### 8.2 Índices críticos por tela

| Tela | Query típica | Índice |
|---|---|---|
| Mapa de leitos | `WHERE setor_id = ? AND status IN (...)` | `ix_leitos_setor_status` |
| PEP (timeline) | `WHERE atendimento_id = ? ORDER BY data_hora DESC` | `ix_evol_atend` |
| Painel farmácia | `WHERE atendimento_id = ? AND turno = ?` | `(atendimento_id, data_hora)` em `dispensacoes` |
| Busca de paciente | `nome ILIKE '%xxx%'` | `ix_pacientes_nome_trgm` |
| Folha de produção | `WHERE prestador_executante_id = ? AND data_realizacao BETWEEN` | `ix_ci_executante` |
| Faturamento por convênio | `WHERE convenio_id = ? AND data_fechamento BETWEEN` | `ix_contas_convenio_data` |
| Alergia (pre-prescrição) | `alergias @> '[{"substancia":"penicilina"}]'` | `ix_pacientes_alergias` (GIN) |

### 8.3 Statistics e configurações Postgres recomendadas

```ini
# postgresql.conf — referência para hospital de porte médio (200-500 leitos):
shared_buffers = 8GB              # 25% RAM
effective_cache_size = 24GB       # 75% RAM
work_mem = 32MB
maintenance_work_mem = 1GB
random_page_cost = 1.1            # SSD
effective_io_concurrency = 200    # SSD
max_wal_size = 8GB
checkpoint_timeout = 15min
default_statistics_target = 200   # estatísticas mais finas
```

---

## 9. Particionamento

### 9.1 Tabelas particionadas (range mensal por `data_hora` ou `created_at`)

- `evolucoes` (alta volumetria — múltiplas evoluções por dia por paciente)
- `prescricoes` (idem)
- `dispensacoes` (idem)
- `auditoria_eventos` (cresce muito rápido)
- `acessos_prontuario` (idem)

### 9.2 Job mensal de gestão de partições

Worker BullMQ executa no dia 25 de cada mês:

1. Cria partições do mês seguinte para todas as tabelas particionadas.
2. **Atatcha** partições antigas (>24 meses) ao schema `archive` e desanexa.
3. Compacta partições arquivadas (BRIN ou COMPRESS).

### 9.3 Não particionado (mas grande)

`contas`, `contas_itens`, `atendimentos` — particionar se passar de **50 milhões de linhas**. Por ora, índices bem-feitos resolvem.

---

## 10. Constraints e regras transacionais

### 10.1 Constraint patterns críticas

| Caso | Implementação |
|---|---|
| Sem overbooking de agenda | `EXCLUDE USING gist` em `agendamentos.recurso_id × tstzrange` |
| Sem dois pacientes no mesmo leito | `ck_leitos_ocupacao` + `UNIQUE (paciente_id) DEFERRABLE` |
| Sem cirurgias sobrepostas na sala | `EXCLUDE USING gist` em `cirurgias.sala_id × tstzrange` |
| Conta liquido = total - glosa + revertido | `CHECK (valor_liquido = ...)` |
| Saída ≥ entrada | `CHECK (data_hora_saida >= data_hora_entrada)` |
| Convenio exige carteirinha | `CHECK ((tipo_cobranca='CONVENIO' AND ...) OR ...)` |
| Óbito tem data | `CHECK ((obito=FALSE AND data_obito IS NULL) OR ...)` |

### 10.2 Triggers críticas

| Trigger | Tabela | Ação |
|---|---|---|
| `tg_audit` | todas clínicas/financeiras | escreve em `auditoria_eventos` |
| `tg_imutavel_apos_assinatura` | `evolucoes`, `prescricoes`, `resultados_exame`, `documentos_emitidos` | bloqueia UPDATE/DELETE quando `assinada_em IS NOT NULL` (correção via nova versão) |
| `tg_atualiza_totais_conta` | `contas_itens` | recalcula `contas.valor_*` em INSERT/UPDATE/DELETE |
| `tg_outbox_evento_dominio` | tabelas que publicam eventos | insere em `outbox_events` |
| `tg_paciente_cpf_hash` | `pacientes` | mantém `cpf_hash` derivado de `cpf_encrypted` |

### 10.3 Idempotência financeira

Operações `apurar_repasse`, `gerar_lote_tiss`, `recalcular_conta` recebem `operacao_id UUID`. Tabela `operacoes_executadas` evita reprocesso:

```sql
CREATE TABLE operacoes_executadas (
  operacao_id  UUID PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  tipo         VARCHAR(40) NOT NULL,
  contexto     JSONB,
  executada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. Diagrama relacional (visão por contexto)

> Visão simplificada — para diagrama completo, gerar via `prisma erd` ou `dbml`.

### Contexto — Cadastros

```
tenants ──┬──< usuarios >── perfis_permissoes
          ├──< pacientes >── pacientes_convenios ─> convenios ─< planos
          ├──< prestadores >── prestadores_especialidades ─> especialidades
          ├──< tabelas_procedimentos
          ├──< tabelas_precos >── tabelas_precos_itens
          ├──< condicoes_contratuais
          ├──< setores ─< leitos
          └──< setores ─< salas_cirurgicas
```

### Contexto — Atendimento + PEP

```
pacientes ──< atendimentos >── prestadores
                    │
                    ├──< evolucoes
                    ├──< prescricoes ──< prescricoes_itens
                    │         └──< analises_farmaceuticas
                    ├──< solicitacoes_exame ──< solicitacoes_exame_itens ──< resultados_exame
                    ├──< documentos_emitidos
                    └── conta_id ─> contas
```

### Contexto — Faturamento + Glosa + Repasse

```
atendimentos ──> contas ──< contas_itens ──> tabelas_procedimentos
                  │              │
                  │              └──< glosas
                  ├──< guias_tiss ──> lotes_tiss
                  └──< repasses_itens >── repasses ──> prestadores
                                  └──> criterios_repasse
```

### Contexto — Farmácia

```
prescricoes ──< prescricoes_itens
       │
       └──> dispensacoes ──< dispensacoes_itens ──> contas_itens
                                  └──> livro_controlados
```

### Contexto — Centro Cirúrgico

```
atendimentos ──> cirurgias ──< cirurgias_equipe ──> prestadores
                    │
                    ├──> kits_cirurgicos ──< kits_cirurgicos_itens
                    └──> cadernos_gabaritos ──< cadernos_gabaritos_itens
```

---

## 12. Estratégia de migrations

- **Prisma Migrate** + arquivos `.sql` versionados.
- Convenção: `NNNNNN_verbo_objeto.sql` (ex.: `000023_add_rqe_to_prestadores.sql`).
- Migrations **nunca** são editadas após aplicadas em qualquer ambiente. Erros viram nova migration corretiva.
- Migrations destrutivas (DROP COLUMN, DROP TABLE) seguem **expand-contract**:
  1. Migration A: adiciona coluna nova / nova tabela.
  2. Deploy aplicação que escreve em ambas.
  3. Backfill por job.
  4. Deploy aplicação que lê só do novo.
  5. Migration B: remove coluna antiga.
- Índices criados com `CREATE INDEX CONCURRENTLY` em produção.
- Adição de coluna `NOT NULL` segue: adicionar como `NULL`, backfill, `SET NOT NULL`.
- Toda migration tem **plano de rollback** documentado no header do arquivo.

---

## 13. Seeds e dados de referência

Seeds essenciais (executados em todo ambiente novo):

1. **Tenant `dev` ou `sandbox`** com CNPJ fictício.
2. **Usuário admin** com senha temporária `must-change`.
3. **Perfis padrão**: ADMIN, MEDICO, ENFERMEIRO, FARMACEUTICO, RECEPCAO, FATURAMENTO, AUDITOR, FINANCEIRO.
4. **Permissões** mapeadas para cada perfil.
5. **Tabela TUSS** — importar do CSV oficial da ANS (atualizado trimestralmente).
6. **Tabela CBHPM** — importar do CSV oficial da AMB.
7. **CID-10** — importar do DATASUS.
8. **CBO 2002** — importar do MTE.
9. **Convênios fixos**: `SUS`, `PARTICULAR` (sempre presentes em todo tenant).
10. **Especialidades CBOS** — importar.

Seeds de **demonstração** (apenas em dev/sandbox):
- 3 hospitais fictícios (tenants).
- 200 pacientes sintéticos (gerados com Faker, **CPFs inválidos** propositalmente).
- 50 prestadores fictícios.
- 5 convênios fictícios com tabelas de preço.

---

## 14. Resumo das tabelas

| Categoria | Tabelas |
|---|---|
| Identidade | `tenants`, `usuarios`, `perfis`, `permissoes`, `usuarios_perfis`, `perfis_permissoes`, `sessoes_ativas` |
| Cadastros | `pacientes`, `pacientes_convenios`, `prestadores`, `especialidades`, `prestadores_especialidades`, `convenios`, `planos`, `condicoes_contratuais`, `tabelas_precos`, `tabelas_precos_itens`, `convenios_tabelas_precos`, `tabelas_procedimentos`, `unidades_faturamento`, `unidades_atendimento`, `centros_custo`, `setores`, `salas_cirurgicas`, `leitos` |
| Agendamento | `agendas_recursos`, `agendas_disponibilidade`, `agendas_bloqueios`, `agendamentos` |
| PEP | `atendimentos`, `evolucoes`, `prescricoes`, `prescricoes_itens`, `analises_farmaceuticas`, `solicitacoes_exame`, `solicitacoes_exame_itens`, `resultados_exame`, `documentos_emitidos` |
| Faturamento | `contas`, `contas_itens`, `pacotes`, `pacotes_itens`, `lotes_tiss`, `guias_tiss`, `glosas`, `criterios_repasse`, `repasses`, `repasses_itens` |
| Farmácia | `dispensacoes`, `dispensacoes_itens`, `livro_controlados` |
| Centro Cirúrgico | `cirurgias`, `cirurgias_equipe`, `kits_cirurgicos`, `kits_cirurgicos_itens`, `cadernos_gabaritos`, `cadernos_gabaritos_itens` |
| CME | `cme_lotes`, `cme_artigos`, `cme_movimentacoes` |
| CCIH | `ccih_casos` |
| SAME | `same_prontuarios`, `same_emprestimos` |
| Visitantes | `visitantes`, `visitas` |
| Auditoria/LGPD | `auditoria_eventos`, `acessos_prontuario` |
| Infra/Eventos | `outbox_events`, `notificacoes`, `arquivos`, `operacoes_executadas`, `laboratorios_apoio`, `equipamentos` |

**Total estimado: ~70 tabelas** no domínio core (sem contar partições mensais e tabelas auxiliares).

---

## 15. Checklist final para o agente

Antes de fazer qualquer migration, verifique:

- [ ] A tabela já existe em §7?
- [ ] Tem `tenant_id`, `created_at`, `deleted_at`?
- [ ] Todas as FKs estão indexadas?
- [ ] Constraints declarativas (`CHECK`, `UNIQUE`, `EXCLUDE`) cobrem as invariantes?
- [ ] Trigger `tg_audit` será aplicada?
- [ ] É tabela imutável após assinatura? (aplicar `tg_imutavel_apos_assinatura`)
- [ ] Volume justifica particionamento (>10M linhas/ano)?
- [ ] Há colunas sensíveis (CPF, CNS) que precisam criptografia?
- [ ] RLS policy criada?
- [ ] Seeds atualizados (se for tabela de catálogo)?
- [ ] `DB.md` atualizado com a nova tabela/coluna?

> **Lembrete**: dados clínicos não voltam. **Modele errado, fere paciente. Modele certo, salva vidas.**
