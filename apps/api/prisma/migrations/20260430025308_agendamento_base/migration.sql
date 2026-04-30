-- ─────────────────────────────────────────────────────────────────────
-- Fase 4 / P0 — Agendamento (DB.md §7.4)
--
-- Objetivo central: garantir AUSÊNCIA de overbooking via EXCLUDE
-- constraint no banco (RN-AGE-01). A app NUNCA deve ser a única linha
-- de defesa contra colisão de horário — está aqui no schema.
-- ─────────────────────────────────────────────────────────────────────

-- ENUMs
CREATE TYPE enum_agenda_recurso_tipo AS ENUM ('PRESTADOR', 'SALA', 'EQUIPAMENTO');

-- enum_atendimento_tipo já existe? Sim, criado em cadastros_base.
-- Se não, descomentar:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_atendimento_tipo') THEN
    CREATE TYPE enum_atendimento_tipo AS ENUM (
      'CONSULTA', 'EXAME', 'INTERNACAO', 'CIRURGIA',
      'PRONTO_ATENDIMENTO', 'TELECONSULTA', 'OBSERVACAO'
    );
  END IF;
END$$;

CREATE TYPE enum_agendamento_status AS ENUM (
  'AGENDADO', 'CONFIRMADO', 'COMPARECEU', 'FALTOU', 'CANCELADO', 'REAGENDADO'
);

CREATE TYPE enum_agendamento_origem AS ENUM (
  'INTERNO', 'PORTAL', 'TOTEM', 'TELEFONE', 'API'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Equipamentos — catálogo simples para recursos de agenda
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE equipamentos (
  id           BIGSERIAL PRIMARY KEY,
  uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  setor_id     BIGINT REFERENCES setores(id) ON DELETE RESTRICT,
  codigo       VARCHAR(40) NOT NULL,
  nome         VARCHAR(200) NOT NULL,
  tipo         VARCHAR(50),
  modelo       VARCHAR(120),
  serial       VARCHAR(60),
  status       VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL',
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT uq_equipamentos UNIQUE (tenant_id, codigo)
);
CREATE UNIQUE INDEX uq_equipamentos_uuid ON equipamentos (uuid_externo);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. agendas_recursos — médico OU sala OU equipamento como recurso agendável
--    Exatamente uma das 3 FKs preenchida (CHECK).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE agendas_recursos (
  id                BIGSERIAL PRIMARY KEY,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  tipo              enum_agenda_recurso_tipo NOT NULL,
  prestador_id      BIGINT REFERENCES prestadores(id) ON DELETE RESTRICT,
  sala_id           BIGINT REFERENCES salas_cirurgicas(id) ON DELETE RESTRICT,
  equipamento_id    BIGINT REFERENCES equipamentos(id) ON DELETE RESTRICT,
  intervalo_minutos INTEGER NOT NULL DEFAULT 30,
  permite_encaixe   BOOLEAN NOT NULL DEFAULT TRUE,
  encaixe_max_dia   INTEGER NOT NULL DEFAULT 2,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  observacao        VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT ck_recurso_tipo CHECK (
    (tipo = 'PRESTADOR'   AND prestador_id IS NOT NULL AND sala_id IS NULL AND equipamento_id IS NULL) OR
    (tipo = 'SALA'        AND sala_id IS NOT NULL AND prestador_id IS NULL AND equipamento_id IS NULL) OR
    (tipo = 'EQUIPAMENTO' AND equipamento_id IS NOT NULL AND prestador_id IS NULL AND sala_id IS NULL)
  ),
  CONSTRAINT ck_intervalo CHECK (intervalo_minutos BETWEEN 5 AND 480)
);
CREATE UNIQUE INDEX uq_agendas_recursos_uuid ON agendas_recursos (uuid_externo);
CREATE UNIQUE INDEX uq_agendas_recursos_prestador  ON agendas_recursos (prestador_id)   WHERE prestador_id   IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_agendas_recursos_sala       ON agendas_recursos (sala_id)        WHERE sala_id        IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_agendas_recursos_equipamento ON agendas_recursos (equipamento_id) WHERE equipamento_id IS NOT NULL AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. agendas_disponibilidade — janelas em que o recurso atende
--    Pode ser semanal (dia_semana 0..6) OU data específica (override)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE agendas_disponibilidade (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  recurso_id      BIGINT NOT NULL REFERENCES agendas_recursos(id) ON DELETE CASCADE,
  dia_semana      INTEGER,                                  -- 0=domingo .. 6=sábado
  data_especifica DATE,
  hora_inicio     TIME NOT NULL,
  hora_fim        TIME NOT NULL,
  vigencia_inicio DATE,
  vigencia_fim    DATE,
  ativa           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ad_dia_ou_data CHECK (
    (dia_semana IS NOT NULL AND data_especifica IS NULL AND dia_semana BETWEEN 0 AND 6) OR
    (data_especifica IS NOT NULL AND dia_semana IS NULL)
  ),
  CONSTRAINT ck_ad_horas CHECK (hora_fim > hora_inicio),
  CONSTRAINT ck_ad_vigencia CHECK (
    vigencia_fim IS NULL OR vigencia_inicio IS NULL OR vigencia_fim >= vigencia_inicio
  )
);
CREATE INDEX ix_disponibilidade_recurso_semana ON agendas_disponibilidade (recurso_id, dia_semana) WHERE ativa;
CREATE INDEX ix_disponibilidade_recurso_data   ON agendas_disponibilidade (recurso_id, data_especifica) WHERE ativa;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. agendas_bloqueios — férias, congresso, manutenção
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE agendas_bloqueios (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  recurso_id  BIGINT NOT NULL REFERENCES agendas_recursos(id) ON DELETE CASCADE,
  inicio      TIMESTAMPTZ NOT NULL,
  fim         TIMESTAMPTZ NOT NULL,
  motivo      VARCHAR(200),
  criado_por  BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ab_periodo CHECK (fim > inicio)
);
CREATE INDEX ix_bloqueios_recurso ON agendas_bloqueios (recurso_id, inicio);
-- Bloqueios também não podem se sobrepor entre si para o mesmo recurso.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE agendas_bloqueios
  ADD CONSTRAINT xc_bloqueios_overlap
  EXCLUDE USING gist (
    recurso_id WITH =,
    tstzrange(inicio, fim, '[)') WITH &&
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. agendamentos — coração da Fase 4. EXCLUDE garante NO OVERBOOKING.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE agendamentos (
  id                   BIGSERIAL PRIMARY KEY,
  uuid_externo         UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id            BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  paciente_id          BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  recurso_id           BIGINT NOT NULL REFERENCES agendas_recursos(id) ON DELETE RESTRICT,
  procedimento_id      BIGINT REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  inicio               TIMESTAMPTZ NOT NULL,
  fim                  TIMESTAMPTZ NOT NULL,
  tipo                 enum_atendimento_tipo NOT NULL,
  status               enum_agendamento_status NOT NULL DEFAULT 'AGENDADO',
  origem               enum_agendamento_origem NOT NULL DEFAULT 'INTERNO',
  encaixe              BOOLEAN NOT NULL DEFAULT FALSE,
  encaixe_motivo       VARCHAR(300),
  convenio_id          BIGINT REFERENCES convenios(id) ON DELETE RESTRICT,
  plano_id             BIGINT REFERENCES planos(id) ON DELETE RESTRICT,
  observacao           VARCHAR(500),
  link_teleconsulta    VARCHAR(500),
  teleconsulta_nonce   VARCHAR(80),
  -- Confirmação 24h
  confirmado_em        TIMESTAMPTZ,
  confirmado_por       BIGINT,                              -- usuario_id (recepção) OU paciente via portal
  confirmado_via       VARCHAR(40),                          -- SMS, EMAIL, WHATSAPP, PORTAL, TELEFONE, RECEPCAO
  -- Check-in / no-show / cancelamento
  checkin_em           TIMESTAMPTZ,
  checkin_por          BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  no_show_marcado_em   TIMESTAMPTZ,
  cancelado_em         TIMESTAMPTZ,
  cancelado_por        BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  cancelamento_motivo  VARCHAR(300),
  reagendado_para_id   BIGINT REFERENCES agendamentos(id) ON DELETE SET NULL,
  -- Audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ,
  updated_by           BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  versao               INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT ck_agend_periodo CHECK (fim > inicio),
  CONSTRAINT ck_agend_encaixe_motivo CHECK (
    encaixe = FALSE OR (encaixe = TRUE AND encaixe_motivo IS NOT NULL)
  ),
  -- INVARIANTE CRÍTICA — RN-AGE-01:
  -- Sem sobreposição para o mesmo recurso, EXCETO quando encaixe=TRUE
  -- ou status ∈ (CANCELADO, REAGENDADO). Garantia DDL — não confiar no app.
  CONSTRAINT xc_agend_overlap EXCLUDE USING gist (
    recurso_id WITH =,
    tstzrange(inicio, fim, '[)') WITH &&
  ) WHERE (status NOT IN ('CANCELADO', 'REAGENDADO') AND encaixe = FALSE)
);
CREATE UNIQUE INDEX uq_agendamentos_uuid ON agendamentos (uuid_externo);
CREATE INDEX ix_agend_recurso_inicio ON agendamentos (recurso_id, inicio);
CREATE INDEX ix_agend_paciente       ON agendamentos (paciente_id, inicio DESC);
CREATE INDEX ix_agend_status         ON agendamentos (tenant_id, status, inicio) WHERE status IN ('AGENDADO','CONFIRMADO');
CREATE INDEX ix_agend_no_show        ON agendamentos (inicio) WHERE status IN ('AGENDADO','CONFIRMADO');

-- ═══════════════════════════════════════════════════════════════════════
-- 6. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON equipamentos              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON agendas_recursos          FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON agendas_disponibilidade   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON agendas_bloqueios         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON agendamentos              FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. RLS + POLICY tenant_isolation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE equipamentos              ENABLE ROW LEVEL SECURITY;  ALTER TABLE equipamentos              FORCE ROW LEVEL SECURITY;
ALTER TABLE agendas_recursos          ENABLE ROW LEVEL SECURITY;  ALTER TABLE agendas_recursos          FORCE ROW LEVEL SECURITY;
ALTER TABLE agendas_disponibilidade   ENABLE ROW LEVEL SECURITY;  ALTER TABLE agendas_disponibilidade   FORCE ROW LEVEL SECURITY;
ALTER TABLE agendas_bloqueios         ENABLE ROW LEVEL SECURITY;  ALTER TABLE agendas_bloqueios         FORCE ROW LEVEL SECURITY;
ALTER TABLE agendamentos              ENABLE ROW LEVEL SECURITY;  ALTER TABLE agendamentos              FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON equipamentos              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON agendas_recursos          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON agendas_disponibilidade   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON agendas_bloqueios         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON agendamentos              USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Permissões + grant ADMIN/RECEPCAO/MEDICO
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('agenda',         'read',    'Consultar slots da agenda'),
  ('agendamentos',   'read',    'Listar/ler agendamentos'),
  ('agendamentos',   'write',   'Criar/atualizar agendamento'),
  ('agendamentos',   'cancelar','Cancelar agendamento'),
  ('agendamentos',   'encaixe', 'Override anti-overbooking via flag encaixe'),
  ('agendamentos',   'checkin', 'Marcar comparecimento'),
  ('agendamentos',   'no-show', 'Marcar falta'),
  ('teleconsulta',   'iniciar', 'Gerar/abrir link de teleconsulta')
ON CONFLICT (recurso, acao) DO NOTHING;

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
 WHERE p.codigo IN ('ADMIN','RECEPCAO','MEDICO')
   AND perm.recurso IN ('agenda','agendamentos','teleconsulta')
ON CONFLICT DO NOTHING;
