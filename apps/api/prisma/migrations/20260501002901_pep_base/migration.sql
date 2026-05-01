-- ─────────────────────────────────────────────────────────────────────
-- Fase 6 / P0 — PEP (Prontuário Eletrônico)
-- DB.md §7.6 + §9 (particionamento)
--
-- INVARIANTES CRÍTICAS (CLAUDE.md §0):
--   #3 — Imutabilidade pós-assinatura: trigger no banco bloqueia
--        UPDATE/DELETE em evoluções/prescrições/laudos/documentos
--        após `assinada_em IS NOT NULL`. Correção vira nova versão.
--   #8 — Particionamento range mensal em evolucoes, prescricoes,
--        sinais_vitais (job mensal cria partições futuras).
-- ─────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs (DB.md §4)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_evolucao_tipo_profissional AS ENUM (
  'MEDICO', 'ENFERMEIRO', 'TECNICO_ENFERMAGEM', 'NUTRICIONISTA',
  'FISIOTERAPEUTA', 'PSICOLOGO', 'FARMACEUTICO', 'FONOAUDIOLOGO',
  'TERAPEUTA_OCUPACIONAL', 'ASSISTENTE_SOCIAL', 'OUTROS'
);

CREATE TYPE enum_evolucao_tipo AS ENUM (
  'ANAMNESE', 'EXAME_CLINICO', 'EVOLUCAO',
  'NOTA_ADMISSAO', 'NOTA_ALTA', 'PARECER',
  'INTERCONSULTA', 'RESUMO_ALTA', 'RETIFICACAO'
);

CREATE TYPE enum_prescricao_tipo AS ENUM (
  'MEDICAMENTO', 'CUIDADO', 'DIETA', 'PROCEDIMENTO', 'EXAME', 'COMPOSTA'
);

CREATE TYPE enum_prescricao_status AS ENUM (
  'AGUARDANDO_ANALISE', 'ATIVA', 'SUSPENSA', 'CANCELADA',
  'ENCERRADA', 'RECUSADA_FARMACIA'
);

CREATE TYPE enum_analise_farmaceutica_status AS ENUM (
  'APROVADA', 'RECUSADA', 'APROVADA_RESSALVAS', 'PENDENTE'
);

CREATE TYPE enum_solicitacao_exame_urgencia AS ENUM ('ROTINA', 'URGENTE', 'EMERGENCIA');

CREATE TYPE enum_solicitacao_exame_status AS ENUM (
  'SOLICITADO', 'AUTORIZADO', 'COLETADO', 'EM_PROCESSAMENTO',
  'LAUDO_PARCIAL', 'LAUDO_FINAL', 'CANCELADO', 'NEGADO'
);

CREATE TYPE enum_documento_tipo AS ENUM (
  'ATESTADO', 'RECEITA_SIMPLES', 'RECEITA_CONTROLADO',
  'DECLARACAO', 'ENCAMINHAMENTO', 'RESUMO_ALTA', 'OUTRO'
);

CREATE TYPE enum_interacao_severidade AS ENUM (
  'LEVE', 'MODERADA', 'GRAVE', 'CONTRAINDICADA'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. principios_ativos — catálogo (mini-seed) ligando TUSS de medicamentos
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE principios_ativos (
  id            BIGSERIAL PRIMARY KEY,
  uuid_externo  UUID NOT NULL DEFAULT uuid_generate_v4(),
  nome          VARCHAR(200) NOT NULL,
  nome_ingles   VARCHAR(200),
  classe_atc    VARCHAR(20),                   -- WHO Anatomical Therapeutic Chemical
  dose_max_dia  DECIMAL(18,4),                 -- mg/dia adulto
  unidade_dose  VARCHAR(20),
  observacao    VARCHAR(500),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_principios_ativos_nome UNIQUE (nome)
);

-- Liga procedimentos (medicamentos) → princípios ativos.
CREATE TABLE procedimento_principio_ativo (
  procedimento_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE CASCADE,
  principio_id    BIGINT NOT NULL REFERENCES principios_ativos(id) ON DELETE RESTRICT,
  PRIMARY KEY (procedimento_id, principio_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. interacoes_medicamentosas — catálogo seed mínimo
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE interacoes_medicamentosas (
  id            BIGSERIAL PRIMARY KEY,
  principio_a   BIGINT NOT NULL REFERENCES principios_ativos(id) ON DELETE CASCADE,
  principio_b   BIGINT NOT NULL REFERENCES principios_ativos(id) ON DELETE CASCADE,
  severidade    enum_interacao_severidade NOT NULL,
  descricao     TEXT NOT NULL,
  fonte         VARCHAR(120),                  -- ex.: 'Stockley 2019', 'BNF 78'
  ativa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_interacao_diferentes CHECK (principio_a <> principio_b),
  CONSTRAINT uq_interacao_par UNIQUE (principio_a, principio_b)
);
-- Lookup bidirecional via UNION na app, OU criar índice no par ordenado.
CREATE INDEX ix_interacao_a ON interacoes_medicamentosas (principio_a) WHERE ativa;
CREATE INDEX ix_interacao_b ON interacoes_medicamentosas (principio_b) WHERE ativa;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. evoluces — particionada (range mensal por data_hora)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE evolucoes (
  id                      BIGSERIAL,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  atendimento_id          BIGINT NOT NULL,
  paciente_id             BIGINT NOT NULL,
  profissional_id         BIGINT NOT NULL,           -- prestadores.id
  tipo_profissional       enum_evolucao_tipo_profissional NOT NULL,
  tipo                    enum_evolucao_tipo NOT NULL,
  data_hora               TIMESTAMPTZ NOT NULL,
  conteudo                JSONB NOT NULL,             -- TipTap structured doc
  conteudo_html           TEXT,                       -- cache renderizado
  texto_livre             TEXT,                       -- p/ FTS futuro
  cids                    JSONB,
  sinais_vitais           JSONB,
  -- Assinatura
  assinatura_digital      JSONB,                      -- { certInfo, hash, timestamp, algoritmo }
  assinada_em             TIMESTAMPTZ,
  versao_anterior_id      BIGINT,                     -- para retificação (RN-PEP-03)
  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT NOT NULL,
  updated_at              TIMESTAMPTZ,
  updated_by              BIGINT,
  deleted_at              TIMESTAMPTZ,
  PRIMARY KEY (id, data_hora)                          -- partitioning column é parte da PK
) PARTITION BY RANGE (data_hora);

-- Partições iniciais (job mensal cria as próximas)
CREATE TABLE evolucoes_2026_04 PARTITION OF evolucoes FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE evolucoes_2026_05 PARTITION OF evolucoes FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE evolucoes_2026_06 PARTITION OF evolucoes FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE evolucoes_2026_07 PARTITION OF evolucoes FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE UNIQUE INDEX uq_evolucoes_uuid ON evolucoes (uuid_externo, data_hora);
CREATE INDEX ix_evol_atend       ON evolucoes (atendimento_id, data_hora DESC);
CREATE INDEX ix_evol_paciente    ON evolucoes (paciente_id, data_hora DESC);
CREATE INDEX ix_evol_profissional ON evolucoes (profissional_id, data_hora DESC);
CREATE INDEX ix_evol_assinada    ON evolucoes (atendimento_id, assinada_em) WHERE assinada_em IS NOT NULL;
CREATE INDEX ix_evol_texto_trgm  ON evolucoes USING gin (texto_livre gin_trgm_ops) WHERE texto_livre IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. prescricoes — particionada
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE prescricoes (
  id                      BIGSERIAL,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  atendimento_id          BIGINT NOT NULL,
  paciente_id             BIGINT NOT NULL,
  prescritor_id           BIGINT NOT NULL,            -- prestadores.id
  data_hora               TIMESTAMPTZ NOT NULL,
  tipo                    enum_prescricao_tipo NOT NULL,
  validade_inicio         TIMESTAMPTZ NOT NULL,
  validade_fim            TIMESTAMPTZ,
  status                  enum_prescricao_status NOT NULL DEFAULT 'AGUARDANDO_ANALISE',
  prescricao_anterior_id  BIGINT,                     -- retificação
  observacao_geral        TEXT,
  -- Assinatura
  assinatura_digital      JSONB,
  assinada_em             TIMESTAMPTZ,
  -- Suspensão (item-level mais detalhado em prescricoes_itens.status_item)
  suspensa_em             TIMESTAMPTZ,
  suspensa_por            BIGINT,
  suspensa_motivo         VARCHAR(500),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT,
  updated_at              TIMESTAMPTZ,
  PRIMARY KEY (id, data_hora)
) PARTITION BY RANGE (data_hora);

CREATE TABLE prescricoes_2026_04 PARTITION OF prescricoes FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE prescricoes_2026_05 PARTITION OF prescricoes FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE prescricoes_2026_06 PARTITION OF prescricoes FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE prescricoes_2026_07 PARTITION OF prescricoes FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE UNIQUE INDEX uq_prescricoes_uuid ON prescricoes (uuid_externo, data_hora);
CREATE INDEX ix_prescr_atend     ON prescricoes (atendimento_id, data_hora DESC);
CREATE INDEX ix_prescr_paciente  ON prescricoes (paciente_id, data_hora DESC);
CREATE INDEX ix_prescr_status    ON prescricoes (tenant_id, status, data_hora DESC) WHERE status IN ('AGUARDANDO_ANALISE','ATIVA');

-- prescricoes_itens (NÃO particionada — items pequenos vinculados via id+data_hora)
CREATE TABLE prescricoes_itens (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  prescricao_id       BIGINT NOT NULL,
  prescricao_data_hora TIMESTAMPTZ NOT NULL,           -- composta com prescricoes
  procedimento_id     BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  quantidade          DECIMAL(18,6) NOT NULL,
  unidade_medida      VARCHAR(20),
  dose                VARCHAR(50),                    -- "500mg", "10mL"
  via                 VARCHAR(40),                    -- "VO", "EV", "IM", "SC"
  frequencia          VARCHAR(50),                    -- "8/8h", "12/12h", "SOS"
  horarios            JSONB,                          -- ["06:00","14:00","22:00"]
  duracao_dias        INTEGER,
  urgente             BOOLEAN NOT NULL DEFAULT FALSE,
  se_necessario       BOOLEAN NOT NULL DEFAULT FALSE,
  observacao          VARCHAR(500),
  -- Validações pré-emissão (RN-PEP-05/06, RN-PRE-07)
  alerta_alergia      JSONB,                          -- {detectada, justificativa, override_por}
  alerta_interacao    JSONB,                          -- [{outro_item_id, severidade, descricao, override}]
  alerta_dose_max     JSONB,                          -- {detectado, dose_solicitada, dose_max, justificativa}
  status_item         VARCHAR(30) NOT NULL DEFAULT 'ATIVO',  -- ATIVO, SUSPENSO, ENCERRADO, RECUSADO
  CONSTRAINT ck_psi_qtd CHECK (quantidade > 0)
);
CREATE UNIQUE INDEX uq_prescricoes_itens_uuid ON prescricoes_itens (uuid_externo);
CREATE INDEX ix_pi_prescricao ON prescricoes_itens (prescricao_id);
CREATE INDEX ix_pi_proc       ON prescricoes_itens (procedimento_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. analises_farmaceuticas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE analises_farmaceuticas (
  id                   BIGSERIAL PRIMARY KEY,
  uuid_externo         UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id            BIGINT NOT NULL,
  prescricao_id        BIGINT NOT NULL,
  prescricao_data_hora TIMESTAMPTZ NOT NULL,
  farmaceutico_id      BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  status               enum_analise_farmaceutica_status NOT NULL,
  parecer              TEXT,
  ressalvas            JSONB,                          -- por item da prescrição
  data_hora            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT NOT NULL
);
CREATE UNIQUE INDEX uq_analises_uuid ON analises_farmaceuticas (uuid_externo);
CREATE INDEX ix_analises_prescricao ON analises_farmaceuticas (prescricao_id, data_hora DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. solicitacoes_exame + itens + resultados_exame
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE solicitacoes_exame (
  id                BIGSERIAL PRIMARY KEY,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL,
  atendimento_id    BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  paciente_id       BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  solicitante_id    BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  urgencia          enum_solicitacao_exame_urgencia NOT NULL DEFAULT 'ROTINA',
  indicacao_clinica TEXT NOT NULL,
  numero_guia       VARCHAR(30),
  status            enum_solicitacao_exame_status NOT NULL DEFAULT 'SOLICITADO',
  data_solicitacao  TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_realizacao   TIMESTAMPTZ,
  observacao        VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_solicitacoes_exame_uuid ON solicitacoes_exame (uuid_externo);
CREATE INDEX ix_sol_exame_atend ON solicitacoes_exame (atendimento_id, data_solicitacao DESC);

CREATE TABLE solicitacoes_exame_itens (
  id                BIGSERIAL PRIMARY KEY,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL,
  solicitacao_id    BIGINT NOT NULL REFERENCES solicitacoes_exame(id) ON DELETE CASCADE,
  procedimento_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  observacao        VARCHAR(500),
  status            enum_solicitacao_exame_status NOT NULL DEFAULT 'SOLICITADO',
  resultado_id      BIGINT
);
CREATE UNIQUE INDEX uq_sol_exame_itens_uuid ON solicitacoes_exame_itens (uuid_externo);
CREATE INDEX ix_sol_itens_sol ON solicitacoes_exame_itens (solicitacao_id);

CREATE TABLE resultados_exame (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  solicitacao_item_id BIGINT NOT NULL REFERENCES solicitacoes_exame_itens(id) ON DELETE RESTRICT,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  data_coleta         TIMESTAMPTZ,
  data_processamento  TIMESTAMPTZ,
  data_laudo          TIMESTAMPTZ,
  laudista_id         BIGINT REFERENCES prestadores(id) ON DELETE RESTRICT,
  laudo_estruturado   JSONB,                           -- {analitos:[{nome,valor,unidade,refMin,refMax}]}
  laudo_texto         TEXT,
  laudo_pdf_url       VARCHAR(500),
  imagens_urls        JSONB,
  status              enum_solicitacao_exame_status NOT NULL,
  -- Assinatura
  assinatura_digital  JSONB,
  assinado_em         TIMESTAMPTZ,
  versao_anterior_id  BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_resultados_exame_uuid ON resultados_exame (uuid_externo);
CREATE INDEX ix_res_exame_paciente ON resultados_exame (paciente_id, data_laudo DESC);
CREATE INDEX ix_res_exame_assinado ON resultados_exame (paciente_id, assinado_em) WHERE assinado_em IS NOT NULL;

-- FK retroativa em solicitacoes_exame_itens.resultado_id
ALTER TABLE solicitacoes_exame_itens
  ADD CONSTRAINT fk_sol_item_resultado FOREIGN KEY (resultado_id) REFERENCES resultados_exame(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. documentos_emitidos
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE documentos_emitidos (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  atendimento_id      BIGINT REFERENCES atendimentos(id) ON DELETE RESTRICT,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  emissor_id          BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  tipo                enum_documento_tipo NOT NULL,
  conteudo            JSONB NOT NULL,                  -- estruturado por tipo
  pdf_url             VARCHAR(500),
  -- Assinatura
  assinatura_digital  JSONB,
  assinado_em         TIMESTAMPTZ,
  data_emissao        TIMESTAMPTZ NOT NULL DEFAULT now(),
  validade_dias       INTEGER,                         -- atestados: 1..30 etc.
  versao_anterior_id  BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_documentos_emitidos_uuid ON documentos_emitidos (uuid_externo);
CREATE INDEX ix_docs_paciente ON documentos_emitidos (paciente_id, data_emissao DESC);
CREATE INDEX ix_docs_emissor  ON documentos_emitidos (emissor_id, data_emissao DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. sinais_vitais — particionada (frequência alta)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE sinais_vitais (
  id                BIGSERIAL,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL,
  atendimento_id    BIGINT NOT NULL,
  paciente_id       BIGINT NOT NULL,
  registrado_por    BIGINT NOT NULL,                   -- usuarios.id
  data_hora         TIMESTAMPTZ NOT NULL,
  pa_sistolica      INTEGER,
  pa_diastolica     INTEGER,
  fc                INTEGER,
  fr                INTEGER,
  temperatura       DECIMAL(4,1),
  sat_o2            INTEGER,
  glicemia          INTEGER,
  peso_kg           DECIMAL(5,2),
  altura_cm         INTEGER,
  dor_eva           SMALLINT,
  observacao        TEXT,
  -- Override fisiológico
  valor_confirmado  BOOLEAN NOT NULL DEFAULT FALSE,
  justificativa     VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, data_hora),
  CONSTRAINT ck_sv_eva CHECK (dor_eva IS NULL OR dor_eva BETWEEN 0 AND 10)
) PARTITION BY RANGE (data_hora);

CREATE TABLE sinais_vitais_2026_04 PARTITION OF sinais_vitais FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE sinais_vitais_2026_05 PARTITION OF sinais_vitais FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE sinais_vitais_2026_06 PARTITION OF sinais_vitais FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE sinais_vitais_2026_07 PARTITION OF sinais_vitais FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX ix_sv_atend ON sinais_vitais (atendimento_id, data_hora DESC);
CREATE INDEX ix_sv_paciente ON sinais_vitais (paciente_id, data_hora DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. INVARIANTE #3 — Trigger imutabilidade pós-assinatura
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_imutavel_apos_assinatura() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.assinada_em IS NOT NULL AND OLD.assinada_em IS DISTINCT FROM NEW.assinada_em THEN
      RAISE EXCEPTION 'Registro assinado é imutável (id=%, assinada_em=%). Crie nova versão via versao_anterior_id.', OLD.id, OLD.assinada_em
        USING ERRCODE = '23514';                       -- check_violation (mais natural que custom)
    END IF;
    IF OLD.assinada_em IS NOT NULL THEN
      RETURN OLD;                                       -- ignora UPDATE silenciosamente após assinada
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.assinada_em IS NOT NULL THEN
      RAISE EXCEPTION 'DELETE bloqueado: registro assinado (id=%, assinada_em=%)', OLD.id, OLD.assinada_em
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger nas 4 tabelas com semântica de assinatura
-- Atenção: para tabelas particionadas, criamos no parent — Postgres 12+ aplica em todas as partições.
-- assinada_em é a coluna em evolucoes/prescricoes/documentos_emitidos; resultados_exame usa assinado_em.
-- Para resultados_exame e documentos_emitidos a coluna é diferente — criamos função alternativa.

CREATE OR REPLACE FUNCTION fn_imutavel_apos_assinado() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.assinado_em IS NOT NULL AND OLD.assinado_em IS DISTINCT FROM NEW.assinado_em THEN
      RAISE EXCEPTION 'Registro assinado é imutável (id=%, assinado_em=%). Crie nova versão via versao_anterior_id.', OLD.id, OLD.assinado_em
        USING ERRCODE = '23514';
    END IF;
    IF OLD.assinado_em IS NOT NULL THEN
      RETURN OLD;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.assinado_em IS NOT NULL THEN
      RAISE EXCEPTION 'DELETE bloqueado: registro assinado (id=%, assinado_em=%)', OLD.id, OLD.assinado_em
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_imutavel_apos_assinatura
  BEFORE UPDATE OR DELETE ON evolucoes
  FOR EACH ROW EXECUTE FUNCTION fn_imutavel_apos_assinatura();

CREATE TRIGGER tg_imutavel_apos_assinatura
  BEFORE UPDATE OR DELETE ON prescricoes
  FOR EACH ROW EXECUTE FUNCTION fn_imutavel_apos_assinatura();

CREATE TRIGGER tg_imutavel_apos_assinatura
  BEFORE UPDATE OR DELETE ON documentos_emitidos
  FOR EACH ROW EXECUTE FUNCTION fn_imutavel_apos_assinatura();

CREATE TRIGGER tg_imutavel_apos_assinado
  BEFORE UPDATE OR DELETE ON resultados_exame
  FOR EACH ROW EXECUTE FUNCTION fn_imutavel_apos_assinado();

-- ═══════════════════════════════════════════════════════════════════════
-- 11. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
-- Para tabelas particionadas, é necessário criar trigger no parent.
-- Postgres 12+ aplica em todas as partições novas.
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON principios_ativos             FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON interacoes_medicamentosas     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON evolucoes                     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON prescricoes                   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON prescricoes_itens             FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON analises_farmaceuticas        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON solicitacoes_exame            FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON solicitacoes_exame_itens      FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON resultados_exame              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON documentos_emitidos           FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON sinais_vitais                 FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 12. RLS + POLICY tenant_isolation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE evolucoes                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE evolucoes                 FORCE ROW LEVEL SECURITY;
ALTER TABLE prescricoes               ENABLE ROW LEVEL SECURITY;  ALTER TABLE prescricoes               FORCE ROW LEVEL SECURITY;
ALTER TABLE prescricoes_itens         ENABLE ROW LEVEL SECURITY;  ALTER TABLE prescricoes_itens         FORCE ROW LEVEL SECURITY;
ALTER TABLE analises_farmaceuticas    ENABLE ROW LEVEL SECURITY;  ALTER TABLE analises_farmaceuticas    FORCE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_exame        ENABLE ROW LEVEL SECURITY;  ALTER TABLE solicitacoes_exame        FORCE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_exame_itens  ENABLE ROW LEVEL SECURITY;  ALTER TABLE solicitacoes_exame_itens  FORCE ROW LEVEL SECURITY;
ALTER TABLE resultados_exame          ENABLE ROW LEVEL SECURITY;  ALTER TABLE resultados_exame          FORCE ROW LEVEL SECURITY;
ALTER TABLE documentos_emitidos       ENABLE ROW LEVEL SECURITY;  ALTER TABLE documentos_emitidos       FORCE ROW LEVEL SECURITY;
ALTER TABLE sinais_vitais             ENABLE ROW LEVEL SECURITY;  ALTER TABLE sinais_vitais             FORCE ROW LEVEL SECURITY;
-- principios_ativos e interacoes_medicamentosas são catálogo global — sem RLS.

CREATE POLICY tenant_isolation ON evolucoes                 USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON prescricoes               USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON prescricoes_itens         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON analises_farmaceuticas    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON solicitacoes_exame        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON solicitacoes_exame_itens  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON resultados_exame          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON documentos_emitidos       USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON sinais_vitais             USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 13. Permissões + grant
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('pep',                'read',      'Ler timeline do PEP'),
  ('pep',                'finalidade','Acesso com finalidade declarada (LGPD)'),
  ('evolucoes',          'read',      'Listar/ler evoluções'),
  ('evolucoes',          'write',     'Criar/atualizar rascunho de evolução'),
  ('evolucoes',          'assinar',   'Assinar evolução com ICP-Brasil'),
  ('evolucoes',          'retificar', 'Criar nova versão (RN-PEP-03)'),
  ('prescricoes',        'read',      'Listar/ler prescrições'),
  ('prescricoes',        'write',     'Emitir prescrição (com validações)'),
  ('prescricoes',        'assinar',   'Assinar prescrição (gera demanda farmácia)'),
  ('prescricoes',        'analisar',  'Análise farmacêutica (RN-PRE-01)'),
  ('prescricoes',        'suspender', 'Suspender item ou tudo'),
  ('prescricoes',        'reaprazar', 'Atualizar horários (RN-PRE-04)'),
  ('prescricoes',        'override-alergia',   'Override alerta alergia (RN-PEP-05)'),
  ('prescricoes',        'override-interacao', 'Override interação (RN-PEP-06)'),
  ('prescricoes',        'override-dose',      'Override dose máxima (RN-PRE-07)'),
  ('exames',             'solicitar', 'Solicitar exames'),
  ('exames',             'read',      'Ler solicitações + resultados'),
  ('exames',             'coletar',   'Marcar coleta'),
  ('exames',             'laudar',    'Laudar + assinar (laudista)'),
  ('documentos',         'emitir',    'Emitir atestado/receita/declaração'),
  ('documentos',         'read',      'Ler documentos emitidos'),
  ('sinais_vitais',      'write',     'Registrar sinais vitais'),
  ('sinais_vitais',      'read',      'Ler histórico'),
  ('sinais_vitais',      'override',  'Confirmar valor fora da faixa fisiológica')
ON CONFLICT (recurso, acao) DO NOTHING;

DO $$
DECLARE current_t BIGINT;
BEGIN
  FOR current_t IN SELECT id FROM tenants WHERE ativo LOOP
    PERFORM set_config('app.current_tenant_id', current_t::text, TRUE);
    -- ADMIN tudo
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ADMIN'
       AND perm.recurso IN ('pep','evolucoes','prescricoes','exames','documentos','sinais_vitais')
    ON CONFLICT DO NOTHING;
    -- MEDICO: ler tudo, escrever evolução/prescrição/exame/documento, assinar
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='pep' AND perm.acao IN ('read','finalidade'))
         OR (perm.recurso='evolucoes' AND perm.acao IN ('read','write','assinar','retificar'))
         OR (perm.recurso='prescricoes' AND perm.acao IN ('read','write','assinar','suspender','reaprazar','override-alergia','override-interacao','override-dose'))
         OR (perm.recurso='exames' AND perm.acao IN ('read','solicitar','laudar'))
         OR (perm.recurso='documentos' AND perm.acao IN ('read','emitir'))
         OR (perm.recurso='sinais_vitais' AND perm.acao IN ('read','write','override')))
    ON CONFLICT DO NOTHING;
    -- ENFERMEIRO: ler PEP/prescrições, escrever evolução enfermagem, sinais vitais, marcar coleta
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ENFERMEIRO'
       AND ((perm.recurso='pep' AND perm.acao IN ('read','finalidade'))
         OR (perm.recurso='evolucoes' AND perm.acao IN ('read','write','assinar','retificar'))
         OR (perm.recurso='prescricoes' AND perm.acao='read')
         OR (perm.recurso='exames' AND perm.acao IN ('read','coletar'))
         OR (perm.recurso='sinais_vitais' AND perm.acao IN ('read','write')))
    ON CONFLICT DO NOTHING;
    -- FARMACEUTICO: ler PEP/prescrições, analisar prescrição
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='FARMACEUTICO'
       AND ((perm.recurso='pep' AND perm.acao IN ('read','finalidade'))
         OR (perm.recurso='prescricoes' AND perm.acao IN ('read','analisar')))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
