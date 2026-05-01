-- ============================================================================
-- Fase 7 — Farmácia + Centro Cirúrgico
--
-- Tabelas:
--   - dispensacoes (range-mensal) + dispensacoes_itens
--   - livro_controlados
--   - cirurgias + cirurgias_equipe
--   - kits_cirurgicos + kits_cirurgicos_itens
--   - cadernos_gabaritos + cadernos_gabaritos_itens
--   - contas_itens (esqueleto — Fase 8 expande para faturamento)
--
-- Invariantes:
--   #1 Sem sobreposição de cirurgia na mesma sala (EXCLUDE GIST)
--   #2 Saldo de controlados nunca fica negativo (CHECK + trigger)
--   #3 Confirmação de dispensação gera item em contas_itens (RN-FAR / RN-CC-06)
--   #4 OPME só pode ser registrado como UTILIZADO se autorizado
--   #5 Encerramento de cirurgia exige ficha cirúrgica + ficha anestésica
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_dispensacao_tipo AS ENUM (
  'PRESCRICAO',         -- via item de prescrição
  'AVULSA',             -- sem prescrição (urgência justificada)
  'KIT_CIRURGICO',      -- dispensação em massa para sala
  'DEVOLUCAO'           -- devolução de medicamento
);

CREATE TYPE enum_dispensacao_status AS ENUM (
  'PENDENTE',
  'SEPARADA',
  'DISPENSADA',
  'DEVOLVIDA',
  'CANCELADA'
);

CREATE TYPE enum_cirurgia_tipo_anestesia AS ENUM (
  'GERAL',
  'RAQUIDIANA',
  'PERIDURAL',
  'BLOQUEIO',
  'LOCAL',
  'SEDACAO',
  'NENHUMA'
);

CREATE TYPE enum_cirurgia_classificacao AS ENUM (
  'ELETIVA',
  'URGENCIA',
  'EMERGENCIA'
);

CREATE TYPE enum_cirurgia_status AS ENUM (
  'AGENDADA',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA',
  'SUSPENSA'
);

CREATE TYPE enum_conta_origem_item AS ENUM (
  'PEP',
  'PRESCRICAO',
  'CIRURGIA',
  'EXAME',
  'MANUAL',
  'FARMACIA',
  'PACOTE'
);

CREATE TYPE enum_livro_controlados_movimento AS ENUM (
  'ENTRADA',
  'SAIDA',
  'AJUSTE',
  'PERDA'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. dispensacoes (particionada range-mensal por data_hora)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE dispensacoes (
  id                   BIGSERIAL,
  uuid_externo         UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id            BIGINT NOT NULL,
  atendimento_id       BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  paciente_id          BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  -- Vínculo opcional com prescrição (composta com data_hora pela partição):
  prescricao_id        BIGINT,
  prescricao_data_hora TIMESTAMPTZ,
  -- Vínculo opcional com cirurgia (kit cirúrgico):
  cirurgia_id          BIGINT,
  farmaceutico_id      BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  setor_destino_id     BIGINT REFERENCES setores(id) ON DELETE SET NULL,
  data_hora            TIMESTAMPTZ NOT NULL,
  turno                VARCHAR(20),                                  -- MANHA, TARDE, NOITE, MADRUGADA
  tipo                 enum_dispensacao_tipo NOT NULL,
  status               enum_dispensacao_status NOT NULL DEFAULT 'PENDENTE',
  observacao           VARCHAR(500),
  -- Devolução (cross-link)
  dispensacao_origem_id BIGINT,
  dispensacao_origem_data_hora TIMESTAMPTZ,
  -- Audit:
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT,
  updated_at           TIMESTAMPTZ,
  PRIMARY KEY (id, data_hora)
) PARTITION BY RANGE (data_hora);

CREATE TABLE dispensacoes_2026_04 PARTITION OF dispensacoes FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE dispensacoes_2026_05 PARTITION OF dispensacoes FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE dispensacoes_2026_06 PARTITION OF dispensacoes FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE dispensacoes_2026_07 PARTITION OF dispensacoes FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE dispensacoes_2026_08 PARTITION OF dispensacoes FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE UNIQUE INDEX uq_dispensacoes_uuid ON dispensacoes (uuid_externo, data_hora);
CREATE INDEX ix_disp_atend_data ON dispensacoes (atendimento_id, data_hora DESC);
CREATE INDEX ix_disp_paciente   ON dispensacoes (paciente_id, data_hora DESC);
CREATE INDEX ix_disp_status     ON dispensacoes (tenant_id, status, data_hora DESC) WHERE status IN ('PENDENTE','SEPARADA');
CREATE INDEX ix_disp_turno      ON dispensacoes (tenant_id, turno, data_hora DESC);
CREATE INDEX ix_disp_cirurgia   ON dispensacoes (cirurgia_id) WHERE cirurgia_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. dispensacoes_itens
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE dispensacoes_itens (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  dispensacao_id           BIGINT NOT NULL,
  dispensacao_data_hora    TIMESTAMPTZ NOT NULL,
  procedimento_id          BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  prescricao_item_id       BIGINT REFERENCES prescricoes_itens(id) ON DELETE SET NULL,
  quantidade_prescrita     DECIMAL(18,6) NOT NULL,
  quantidade_dispensada    DECIMAL(18,6) NOT NULL,
  unidade_medida           VARCHAR(20),
  fator_conversao_aplicado DECIMAL(18,6),
  justificativa_divergencia VARCHAR(500),
  lote                     VARCHAR(50),
  validade                 DATE,
  conta_item_id            BIGINT,                                   -- preenchido na confirmação (FK Fase 8)
  status                   enum_dispensacao_status NOT NULL DEFAULT 'PENDENTE',
  CONSTRAINT ck_di_qtd_prescrita CHECK (quantidade_prescrita >= 0),
  CONSTRAINT ck_di_qtd_dispensada CHECK (quantidade_dispensada >= 0)
);

CREATE UNIQUE INDEX uq_dispensacoes_itens_uuid ON dispensacoes_itens (uuid_externo);
CREATE INDEX ix_di_dispensacao ON dispensacoes_itens (dispensacao_id, dispensacao_data_hora);
CREATE INDEX ix_di_proc        ON dispensacoes_itens (procedimento_id);
CREATE INDEX ix_di_prescr_item ON dispensacoes_itens (prescricao_item_id) WHERE prescricao_item_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. livro_controlados
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE livro_controlados (
  id                    BIGSERIAL PRIMARY KEY,
  uuid_externo          UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id             BIGINT NOT NULL,
  data_hora             TIMESTAMPTZ NOT NULL,
  procedimento_id       BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  lote                  VARCHAR(50) NOT NULL,
  quantidade            DECIMAL(18,6) NOT NULL,
  saldo_anterior        DECIMAL(18,6) NOT NULL,
  saldo_atual           DECIMAL(18,6) NOT NULL,
  tipo_movimento        enum_livro_controlados_movimento NOT NULL,
  paciente_id           BIGINT REFERENCES pacientes(id) ON DELETE SET NULL,
  prescricao_id         BIGINT,
  prescricao_data_hora  TIMESTAMPTZ,
  dispensacao_item_id   BIGINT REFERENCES dispensacoes_itens(id) ON DELETE SET NULL,
  receita_documento_url VARCHAR(500),
  farmaceutico_id       BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  observacao            VARCHAR(500),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_lc_qtd CHECK (quantidade > 0),
  CONSTRAINT ck_lc_saldo_atual CHECK (saldo_atual >= 0)
);

CREATE UNIQUE INDEX uq_livro_controlados_uuid ON livro_controlados (uuid_externo);
CREATE INDEX ix_livro_proc_data    ON livro_controlados (procedimento_id, data_hora DESC);
CREATE INDEX ix_livro_lote_data    ON livro_controlados (lote, data_hora DESC);
CREATE INDEX ix_livro_paciente     ON livro_controlados (paciente_id, data_hora DESC) WHERE paciente_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. contas_itens (esqueleto — Fase 8 expande)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE contas_itens (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  conta_id                 BIGINT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  procedimento_id          BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  grupo_gasto              enum_grupo_gasto NOT NULL,
  origem                   enum_conta_origem_item NOT NULL,
  origem_referencia_id     BIGINT,                                  -- prescricao_id, cirurgia_id, dispensacao_item_id...
  origem_referencia_tipo   VARCHAR(40),                             -- 'dispensacao_item', 'cirurgia', 'prescricao', etc.
  quantidade               DECIMAL(18,6) NOT NULL,
  valor_unitario           DECIMAL(18,6) NOT NULL DEFAULT 0,
  valor_total              DECIMAL(18,4) NOT NULL DEFAULT 0,
  prestador_executante_id  BIGINT REFERENCES prestadores(id) ON DELETE SET NULL,
  data_realizacao          TIMESTAMPTZ,
  setor_id                 BIGINT REFERENCES setores(id) ON DELETE SET NULL,
  -- Faturamento e autorização (Fase 8 popula):
  autorizado               BOOLEAN NOT NULL DEFAULT FALSE,
  numero_autorizacao       VARCHAR(40),
  fora_pacote              BOOLEAN NOT NULL DEFAULT FALSE,
  pacote_id                BIGINT,                                  -- FK em Fase 8
  -- OPME / lote:
  lote                     VARCHAR(50),
  validade_lote            DATE,
  registro_anvisa          VARCHAR(40),
  fabricante               VARCHAR(200),
  -- Glosa (Fase 9):
  glosado                  BOOLEAN NOT NULL DEFAULT FALSE,
  valor_glosa              DECIMAL(18,4) NOT NULL DEFAULT 0,
  -- TISS (Fase 8):
  guia_tiss_id             BIGINT,
  tabela_tiss_origem       VARCHAR(10),
  -- Audit:
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  updated_at               TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT,
  CONSTRAINT ck_ci_qtd   CHECK (quantidade > 0),
  CONSTRAINT ck_ci_total CHECK (valor_total >= 0)
);

CREATE UNIQUE INDEX uq_contas_itens_uuid ON contas_itens (uuid_externo);
CREATE INDEX ix_ci_conta  ON contas_itens (conta_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_ci_proc   ON contas_itens (procedimento_id);
CREATE INDEX ix_ci_grupo  ON contas_itens (conta_id, grupo_gasto) WHERE deleted_at IS NULL;
CREATE INDEX ix_ci_origem ON contas_itens (origem, origem_referencia_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. kits_cirurgicos + cadernos_gabaritos
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE kits_cirurgicos (
  id           BIGSERIAL PRIMARY KEY,
  uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id    BIGINT NOT NULL,
  codigo       VARCHAR(40) NOT NULL,
  nome         VARCHAR(200) NOT NULL,
  descricao    TEXT,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   BIGINT,
  updated_at   TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT uq_kits UNIQUE (tenant_id, codigo)
);

CREATE UNIQUE INDEX uq_kits_uuid ON kits_cirurgicos (uuid_externo);
CREATE INDEX ix_kits_ativo ON kits_cirurgicos (tenant_id, ativo) WHERE deleted_at IS NULL;

CREATE TABLE kits_cirurgicos_itens (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  kit_id          BIGINT NOT NULL REFERENCES kits_cirurgicos(id) ON DELETE CASCADE,
  procedimento_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  quantidade      DECIMAL(18,6) NOT NULL,
  obrigatorio     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_kit_proc UNIQUE (kit_id, procedimento_id),
  CONSTRAINT ck_kit_qtd  CHECK (quantidade > 0)
);

CREATE INDEX ix_kit_itens_kit ON kits_cirurgicos_itens (kit_id);

CREATE TABLE cadernos_gabaritos (
  id                        BIGSERIAL PRIMARY KEY,
  uuid_externo              UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                 BIGINT NOT NULL,
  procedimento_principal_id BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  cirurgiao_id              BIGINT REFERENCES prestadores(id) ON DELETE SET NULL,
  versao                    INTEGER NOT NULL DEFAULT 1,
  ativo                     BOOLEAN NOT NULL DEFAULT TRUE,
  observacao                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT,
  updated_at                TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_cg_uuid ON cadernos_gabaritos (uuid_externo);
-- Unicidade composta com cirurgião opcional (COALESCE não cabe em UNIQUE constraint)
CREATE UNIQUE INDEX uq_cg ON cadernos_gabaritos (
  tenant_id, procedimento_principal_id, COALESCE(cirurgiao_id, 0), versao
) WHERE deleted_at IS NULL;
CREATE INDEX ix_cg_proc ON cadernos_gabaritos (procedimento_principal_id, ativo) WHERE deleted_at IS NULL;

CREATE TABLE cadernos_gabaritos_itens (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  caderno_id        BIGINT NOT NULL REFERENCES cadernos_gabaritos(id) ON DELETE CASCADE,
  procedimento_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  quantidade_padrao DECIMAL(18,6) NOT NULL,
  obrigatorio       BOOLEAN NOT NULL DEFAULT FALSE,
  observacao        VARCHAR(300),
  CONSTRAINT uq_cg_proc UNIQUE (caderno_id, procedimento_id),
  CONSTRAINT ck_cg_qtd  CHECK (quantidade_padrao > 0)
);

CREATE INDEX ix_cg_itens_caderno ON cadernos_gabaritos_itens (caderno_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. cirurgias + cirurgias_equipe
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE cirurgias (
  id                          BIGSERIAL PRIMARY KEY,
  uuid_externo                UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                   BIGINT NOT NULL,
  atendimento_id              BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  paciente_id                 BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  procedimento_principal_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  procedimentos_secundarios   JSONB,                                       -- [{procedimento_id, ...}]
  sala_id                     BIGINT NOT NULL REFERENCES salas_cirurgicas(id) ON DELETE RESTRICT,
  data_hora_agendada          TIMESTAMPTZ NOT NULL,
  duracao_estimada_minutos    INTEGER,
  data_hora_inicio            TIMESTAMPTZ,
  data_hora_fim               TIMESTAMPTZ,
  cirurgiao_id                BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  tipo_anestesia              enum_cirurgia_tipo_anestesia,
  classificacao_cirurgia      enum_cirurgia_classificacao NOT NULL DEFAULT 'ELETIVA',
  kit_cirurgico_id            BIGINT REFERENCES kits_cirurgicos(id) ON DELETE SET NULL,
  caderno_gabarito_id         BIGINT REFERENCES cadernos_gabaritos(id) ON DELETE SET NULL,
  ficha_cirurgica             JSONB,
  ficha_anestesica            JSONB,
  intercorrencias             TEXT,
  status                      enum_cirurgia_status NOT NULL DEFAULT 'AGENDADA',
  conta_id                    BIGINT REFERENCES contas(id) ON DELETE SET NULL,
  -- OPME (RN-CC-03):
  opme_solicitada             JSONB,
  opme_autorizada             JSONB,
  opme_utilizada              JSONB,
  opme_autorizacao_em         TIMESTAMPTZ,
  opme_autorizacao_por        BIGINT,
  -- Cancelamento (RN-CC-07):
  cancelado_em                TIMESTAMPTZ,
  cancelado_por               BIGINT,
  cancelamento_motivo         VARCHAR(500),
  -- Audit:
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT,
  updated_at                  TIMESTAMPTZ,
  deleted_at                  TIMESTAMPTZ,
  CONSTRAINT ck_cirurgia_intervalo
    CHECK (data_hora_fim IS NULL OR data_hora_inicio IS NULL OR data_hora_fim > data_hora_inicio),
  -- RN-CC-01 — sem sobreposição na mesma sala (apenas estados ocupados):
  CONSTRAINT xc_cirurgias_sala EXCLUDE USING gist (
    sala_id WITH =,
    tstzrange(data_hora_inicio, data_hora_fim, '[)') WITH &&
  ) WHERE (status IN ('CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA') AND data_hora_inicio IS NOT NULL AND data_hora_fim IS NOT NULL)
);

CREATE UNIQUE INDEX uq_cirurgias_uuid ON cirurgias (uuid_externo);
CREATE INDEX ix_cir_atend       ON cirurgias (atendimento_id);
CREATE INDEX ix_cir_sala_data   ON cirurgias (sala_id, data_hora_agendada);
CREATE INDEX ix_cir_status      ON cirurgias (tenant_id, status, data_hora_agendada);
CREATE INDEX ix_cir_cirurgiao   ON cirurgias (cirurgiao_id, data_hora_agendada DESC);
CREATE INDEX ix_cir_paciente    ON cirurgias (paciente_id);

CREATE TABLE cirurgias_equipe (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  cirurgia_id   BIGINT NOT NULL REFERENCES cirurgias(id) ON DELETE CASCADE,
  prestador_id  BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  funcao        VARCHAR(40) NOT NULL,                                -- CIRURGIAO, AUXILIAR_1, AUXILIAR_2, ANESTESISTA, INSTRUMENTADOR, CIRCULANTE
  ordem         INTEGER NOT NULL DEFAULT 1,
  conta_item_id BIGINT,                                               -- preenchido quando gerar honorário
  CONSTRAINT uq_cir_equipe UNIQUE (cirurgia_id, prestador_id, funcao)
);

CREATE INDEX ix_cir_equipe_cir ON cirurgias_equipe (cirurgia_id);
CREATE INDEX ix_cir_equipe_pre ON cirurgias_equipe (prestador_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON dispensacoes              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON dispensacoes_itens        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON livro_controlados         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON contas_itens              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON kits_cirurgicos           FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON kits_cirurgicos_itens     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cadernos_gabaritos        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cadernos_gabaritos_itens  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cirurgias                 FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cirurgias_equipe          FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 9. RLS — todas as tabelas têm tenant_id e isolam por tenant
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE dispensacoes              ENABLE ROW LEVEL SECURITY;  ALTER TABLE dispensacoes              FORCE ROW LEVEL SECURITY;
ALTER TABLE dispensacoes_itens        ENABLE ROW LEVEL SECURITY;  ALTER TABLE dispensacoes_itens        FORCE ROW LEVEL SECURITY;
ALTER TABLE livro_controlados         ENABLE ROW LEVEL SECURITY;  ALTER TABLE livro_controlados         FORCE ROW LEVEL SECURITY;
ALTER TABLE contas_itens              ENABLE ROW LEVEL SECURITY;  ALTER TABLE contas_itens              FORCE ROW LEVEL SECURITY;
ALTER TABLE kits_cirurgicos           ENABLE ROW LEVEL SECURITY;  ALTER TABLE kits_cirurgicos           FORCE ROW LEVEL SECURITY;
ALTER TABLE kits_cirurgicos_itens     ENABLE ROW LEVEL SECURITY;  ALTER TABLE kits_cirurgicos_itens     FORCE ROW LEVEL SECURITY;
ALTER TABLE cadernos_gabaritos        ENABLE ROW LEVEL SECURITY;  ALTER TABLE cadernos_gabaritos        FORCE ROW LEVEL SECURITY;
ALTER TABLE cadernos_gabaritos_itens  ENABLE ROW LEVEL SECURITY;  ALTER TABLE cadernos_gabaritos_itens  FORCE ROW LEVEL SECURITY;
ALTER TABLE cirurgias                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE cirurgias                 FORCE ROW LEVEL SECURITY;
ALTER TABLE cirurgias_equipe          ENABLE ROW LEVEL SECURITY;  ALTER TABLE cirurgias_equipe          FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON dispensacoes              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON dispensacoes_itens        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON livro_controlados         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON contas_itens              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON kits_cirurgicos           USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON kits_cirurgicos_itens     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cadernos_gabaritos        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cadernos_gabaritos_itens  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cirurgias                 USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cirurgias_equipe          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. INVARIANTE — encerramento de cirurgia exige fichas (RN-CC-04)
--     E início real exige paciente em sala (operacional — checagem por trigger).
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_cirurgia_validate_encerramento() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONCLUIDA' AND OLD.status <> 'CONCLUIDA' THEN
    IF NEW.ficha_cirurgica IS NULL OR jsonb_typeof(NEW.ficha_cirurgica) <> 'object' THEN
      RAISE EXCEPTION 'RN-CC-04: ficha_cirurgica obrigatória para encerrar cirurgia (uuid=%).', NEW.uuid_externo
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.ficha_anestesica IS NULL OR jsonb_typeof(NEW.ficha_anestesica) <> 'object' THEN
      RAISE EXCEPTION 'RN-CC-04: ficha_anestesica obrigatória para encerrar cirurgia (uuid=%).', NEW.uuid_externo
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.data_hora_inicio IS NULL OR NEW.data_hora_fim IS NULL THEN
      RAISE EXCEPTION 'RN-CC-04: cirurgia encerrada exige data_hora_inicio e data_hora_fim (uuid=%).', NEW.uuid_externo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_cirurgia_validate_encerramento
  BEFORE UPDATE ON cirurgias
  FOR EACH ROW
  WHEN (NEW.status = 'CONCLUIDA' AND OLD.status IS DISTINCT FROM 'CONCLUIDA')
  EXECUTE FUNCTION fn_cirurgia_validate_encerramento();

-- ═══════════════════════════════════════════════════════════════════════
-- 11. INVARIANTE — saldo de controlado nunca pode ser negativo
--     (CHECK na coluna já garante; trigger verifica o cálculo)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_livro_controlados_validate() RETURNS TRIGGER AS $$
DECLARE
  v_expected DECIMAL(18,6);
BEGIN
  IF NEW.tipo_movimento = 'ENTRADA' THEN
    v_expected := NEW.saldo_anterior + NEW.quantidade;
  ELSIF NEW.tipo_movimento IN ('SAIDA', 'PERDA') THEN
    v_expected := NEW.saldo_anterior - NEW.quantidade;
  ELSE
    -- AJUSTE: saldo_atual é informado livremente
    v_expected := NEW.saldo_atual;
  END IF;

  IF NEW.saldo_atual <> v_expected THEN
    RAISE EXCEPTION 'RN-FAR-05: saldo_atual (%) inconsistente com saldo_anterior (%) %s quantidade (%) — esperado: %.',
      NEW.saldo_atual, NEW.saldo_anterior,
      CASE WHEN NEW.tipo_movimento = 'ENTRADA' THEN '+' ELSE '-' END,
      NEW.quantidade, v_expected
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_livro_controlados_validate
  BEFORE INSERT ON livro_controlados
  FOR EACH ROW EXECUTE FUNCTION fn_livro_controlados_validate();

-- ═══════════════════════════════════════════════════════════════════════
-- 12. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('farmacia',         'read',         'Painel da farmácia (leitura)'),
  ('farmacia',         'write',        'Operações administrativas da farmácia'),
  ('dispensacao',      'read',         'Listar/ler dispensações'),
  ('dispensacao',      'write',        'Criar/separar/dispensar/devolver'),
  ('dispensacao',      'avulsa',       'Dispensar sem prescrição (urgência)'),
  ('controlados',      'read',         'Ler livro de controlados'),
  ('controlados',      'write',        'Lançar movimentos no livro'),
  ('controlados',      'auditar',      'Auditoria de saldo (perda/ajuste)'),
  ('centro_cirurgico', 'read',         'Mapa de salas / agenda cirúrgica'),
  ('centro_cirurgico', 'agendar',      'Agendar cirurgia'),
  ('centro_cirurgico', 'confirmar',    'Confirmar cirurgia'),
  ('centro_cirurgico', 'iniciar',      'Registrar início real'),
  ('centro_cirurgico', 'encerrar',     'Encerrar cirurgia (CONCLUIDA)'),
  ('centro_cirurgico', 'cancelar',     'Cancelar cirurgia'),
  ('centro_cirurgico', 'ficha',        'Editar ficha cirúrgica/anestésica'),
  ('opme',             'solicitar',    'Solicitar OPME'),
  ('opme',             'autorizar',    'Autorizar OPME'),
  ('opme',             'utilizar',     'Registrar uso de OPME'),
  ('kits',             'read',         'Listar/ler kits cirúrgicos'),
  ('kits',             'write',        'Criar/editar kits cirúrgicos'),
  ('gabaritos',        'read',         'Listar/ler cadernos de gabaritos'),
  ('gabaritos',        'write',        'Criar/editar cadernos de gabaritos')
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
       AND perm.recurso IN ('farmacia','dispensacao','controlados','centro_cirurgico','opme','kits','gabaritos')
    ON CONFLICT DO NOTHING;
    -- FARMACEUTICO: farmácia e controlados (full)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='FARMACEUTICO'
       AND ((perm.recurso='farmacia' AND perm.acao IN ('read','write'))
         OR (perm.recurso='dispensacao' AND perm.acao IN ('read','write','avulsa'))
         OR (perm.recurso='controlados' AND perm.acao IN ('read','write','auditar')))
    ON CONFLICT DO NOTHING;
    -- MEDICO: ler painel de farmácia, agenda cirúrgica + agendar/iniciar/encerrar/ficha + OPME solicitar/utilizar
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='farmacia' AND perm.acao='read')
         OR (perm.recurso='centro_cirurgico' AND perm.acao IN ('read','agendar','iniciar','encerrar','ficha','cancelar'))
         OR (perm.recurso='opme' AND perm.acao IN ('solicitar','utilizar'))
         OR (perm.recurso='kits' AND perm.acao='read')
         OR (perm.recurso='gabaritos' AND perm.acao IN ('read','write')))
    ON CONFLICT DO NOTHING;
    -- ENFERMEIRO: painel farmácia (read), centro cirúrgico (read + iniciar/ficha)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ENFERMEIRO'
       AND ((perm.recurso='farmacia' AND perm.acao='read')
         OR (perm.recurso='dispensacao' AND perm.acao='read')
         OR (perm.recurso='centro_cirurgico' AND perm.acao IN ('read','iniciar','ficha','confirmar'))
         OR (perm.recurso='kits' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
