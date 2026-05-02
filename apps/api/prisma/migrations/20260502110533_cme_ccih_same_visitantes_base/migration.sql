-- ============================================================================
-- Fase 10 — CME + CCIH + SAME + Visitantes
--
-- Tabelas novas:
--   - cme_lotes, cme_artigos, cme_movimentacoes
--   - ccih_casos
--   - same_prontuarios, same_emprestimos
--   - visitantes, visitas
--
-- Invariantes:
--   #1 Lote CME só pode ser liberado se indicador_biologico_ok=TRUE (RN-CME-01)
--   #2 Movimentação atualiza etapa_atual + ultima_movimentacao do artigo (trigger)
--   #3 Lote CME validado/liberado é parcialmente imutável (trigger)
--   #4 Visita só registra entrada se visitante.bloqueado=FALSE (RN-VIS-03)
--   #5 Empréstimo SAME exige solicitante + prazo (RN-SAM-01)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_cme_etapa AS ENUM (
  'RECEPCAO',
  'LIMPEZA',
  'PREPARO',
  'ESTERILIZACAO',
  'GUARDA',
  'DISTRIBUICAO',
  'EM_USO',
  'DESCARTADO'
);

CREATE TYPE enum_cme_metodo_esterilizacao AS ENUM (
  'AUTOCLAVE',
  'OXIDO_ETILENO',
  'PLASMA',
  'OZONIO',
  'QUIMICO_LIQUIDO'
);

CREATE TYPE enum_cme_lote_status AS ENUM (
  'EM_PROCESSAMENTO',
  'AGUARDANDO_INDICADOR',
  'LIBERADO',
  'REPROVADO',
  'EXPIRADO'
);

CREATE TYPE enum_ccih_caso_status AS ENUM (
  'ABERTO',
  'EM_TRATAMENTO',
  'NOTIFICADO',
  'ENCERRADO',
  'CANCELADO'
);

CREATE TYPE enum_ccih_origem_infeccao AS ENUM (
  'COMUNITARIA',
  'HOSPITALAR',
  'INDETERMINADA'
);

CREATE TYPE enum_same_prontuario_status AS ENUM (
  'ARQUIVADO',
  'EMPRESTADO',
  'DIGITALIZADO',
  'DESCARTADO'
);

CREATE TYPE enum_same_emprestimo_status AS ENUM (
  'ATIVO',
  'DEVOLVIDO',
  'ATRASADO'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CME — lotes + artigos + movimentações
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE cme_lotes (
  id                      BIGSERIAL PRIMARY KEY,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  numero                  VARCHAR(40) NOT NULL,
  metodo                  enum_cme_metodo_esterilizacao NOT NULL,
  data_esterilizacao      TIMESTAMPTZ NOT NULL,
  validade                DATE NOT NULL,
  responsavel_id          BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  indicador_biologico_url VARCHAR(500),
  indicador_quimico_ok    BOOLEAN,
  indicador_biologico_ok  BOOLEAN,
  data_liberacao          TIMESTAMPTZ,
  liberado_por            BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_reprovacao         TIMESTAMPTZ,
  motivo_reprovacao       VARCHAR(500),
  status                  enum_cme_lote_status NOT NULL DEFAULT 'EM_PROCESSAMENTO',
  observacao              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT,
  updated_at              TIMESTAMPTZ,
  deleted_at              TIMESTAMPTZ,
  ativo                   BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_cme_lote_numero UNIQUE (tenant_id, numero),
  CONSTRAINT ck_cme_lote_validade CHECK (validade >= data_esterilizacao::date)
);

CREATE UNIQUE INDEX uq_cme_lotes_uuid ON cme_lotes (uuid_externo);
CREATE INDEX ix_cme_lotes_status   ON cme_lotes (tenant_id, status, data_esterilizacao DESC);
CREATE INDEX ix_cme_lotes_validade ON cme_lotes (validade) WHERE status = 'LIBERADO' AND deleted_at IS NULL;

CREATE TABLE cme_artigos (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  lote_id             BIGINT NOT NULL REFERENCES cme_lotes(id) ON DELETE RESTRICT,
  codigo_artigo       VARCHAR(60) NOT NULL,
  descricao           VARCHAR(300),
  etapa_atual         enum_cme_etapa NOT NULL DEFAULT 'RECEPCAO',
  cirurgia_id         BIGINT REFERENCES cirurgias(id) ON DELETE SET NULL,
  paciente_id         BIGINT REFERENCES pacientes(id) ON DELETE SET NULL,
  ultima_movimentacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT,
  updated_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_cme_artigos_uuid ON cme_artigos (uuid_externo);
CREATE INDEX ix_cme_artigos_lote     ON cme_artigos (lote_id);
CREATE INDEX ix_cme_artigos_etapa    ON cme_artigos (tenant_id, etapa_atual);
CREATE INDEX ix_cme_artigos_paciente ON cme_artigos (paciente_id) WHERE paciente_id IS NOT NULL;
CREATE INDEX ix_cme_artigos_cirurgia ON cme_artigos (cirurgia_id) WHERE cirurgia_id IS NOT NULL;

CREATE TABLE cme_movimentacoes (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT NOT NULL,
  artigo_id       BIGINT NOT NULL REFERENCES cme_artigos(id) ON DELETE CASCADE,
  etapa_origem    enum_cme_etapa,
  etapa_destino   enum_cme_etapa NOT NULL,
  responsavel_id  BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  data_hora       TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao      VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_cme_movs_uuid    ON cme_movimentacoes (uuid_externo);
CREATE INDEX ix_cme_movs_artigo  ON cme_movimentacoes (artigo_id, data_hora DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. CCIH — casos de IRAS + antibiograma
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE ccih_casos (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  paciente_id         BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  atendimento_id      BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  setor_id            BIGINT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  leito_id            BIGINT REFERENCES leitos(id) ON DELETE SET NULL,
  data_diagnostico    DATE NOT NULL,
  topografia          VARCHAR(80),                                   -- IRAS: respiratória, urinária, sítio cirúrgico, corrente sanguínea
  cid                 VARCHAR(10),
  microorganismo      VARCHAR(120),
  cultura_origem      VARCHAR(80),
  resistencia         JSONB,                                         -- antibiograma
  origem_infeccao     enum_ccih_origem_infeccao NOT NULL DEFAULT 'INDETERMINADA',
  notificacao_compulsoria BOOLEAN NOT NULL DEFAULT FALSE,
  data_notificacao    TIMESTAMPTZ,
  resultado           VARCHAR(40),                                   -- CURA, OBITO, ALTA_COM_INFECCAO
  status              enum_ccih_caso_status NOT NULL DEFAULT 'ABERTO',
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT,
  updated_at          TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_ccih_casos_uuid ON ccih_casos (uuid_externo);
CREATE INDEX ix_ccih_paciente   ON ccih_casos (paciente_id, data_diagnostico DESC);
CREATE INDEX ix_ccih_setor_data ON ccih_casos (setor_id, data_diagnostico DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_ccih_status     ON ccih_casos (tenant_id, status, data_diagnostico DESC);
CREATE INDEX ix_ccih_microorg   ON ccih_casos (microorganismo) WHERE microorganismo IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. SAME — prontuários físicos + empréstimos
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE same_prontuarios (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT NOT NULL,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  numero_pasta    VARCHAR(40) NOT NULL,
  localizacao     VARCHAR(200),
  status          enum_same_prontuario_status NOT NULL DEFAULT 'ARQUIVADO',
  digitalizado    BOOLEAN NOT NULL DEFAULT FALSE,
  pdf_legado_url  VARCHAR(500),
  data_digitalizacao TIMESTAMPTZ,
  digitalizado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT,
  updated_at      TIMESTAMPTZ,
  CONSTRAINT uq_same_pasta UNIQUE (tenant_id, numero_pasta),
  CONSTRAINT uq_same_paciente UNIQUE (tenant_id, paciente_id)
);

CREATE UNIQUE INDEX uq_same_prontuarios_uuid ON same_prontuarios (uuid_externo);
CREATE INDEX ix_same_status ON same_prontuarios (tenant_id, status);

CREATE TABLE same_emprestimos (
  id                      BIGSERIAL PRIMARY KEY,
  uuid_externo            UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id               BIGINT NOT NULL,
  prontuario_id           BIGINT NOT NULL REFERENCES same_prontuarios(id) ON DELETE RESTRICT,
  solicitante_id          BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_emprestimo         TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_devolucao_prevista DATE NOT NULL,
  data_devolucao_real     TIMESTAMPTZ,
  motivo                  VARCHAR(200) NOT NULL,
  status                  enum_same_emprestimo_status NOT NULL DEFAULT 'ATIVO',
  observacao              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_same_emp_prazo CHECK (data_devolucao_prevista >= data_emprestimo::date)
);

CREATE UNIQUE INDEX uq_same_emprestimos_uuid ON same_emprestimos (uuid_externo);
CREATE INDEX ix_same_emp_prontuario ON same_emprestimos (prontuario_id, data_emprestimo DESC);
CREATE INDEX ix_same_emp_status     ON same_emprestimos (tenant_id, status, data_devolucao_prevista) WHERE status IN ('ATIVO','ATRASADO');

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Visitantes + Visitas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE visitantes (
  id                 BIGSERIAL PRIMARY KEY,
  uuid_externo       UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id          BIGINT NOT NULL,
  nome               VARCHAR(300) NOT NULL,
  cpf_hash           VARCHAR(64) NOT NULL,
  cpf_ultimos4       VARCHAR(4),                          -- exibição parcial (LGPD)
  documento_foto_url VARCHAR(500),
  bloqueado          BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueio    VARCHAR(200),
  bloqueado_em       TIMESTAMPTZ,
  bloqueado_por      BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT,
  updated_at         TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT uq_visitante_cpf UNIQUE (tenant_id, cpf_hash)
);

CREATE UNIQUE INDEX uq_visitantes_uuid ON visitantes (uuid_externo);
CREATE INDEX ix_visitantes_nome_trgm ON visitantes USING gin (f_unaccent(nome) gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX ix_visitantes_bloqueado ON visitantes (tenant_id, bloqueado) WHERE deleted_at IS NULL;

CREATE TABLE visitas (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT NOT NULL,
  visitante_id    BIGINT NOT NULL REFERENCES visitantes(id) ON DELETE RESTRICT,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  atendimento_id  BIGINT REFERENCES atendimentos(id) ON DELETE SET NULL,
  leito_id        BIGINT REFERENCES leitos(id) ON DELETE SET NULL,
  setor_id        BIGINT REFERENCES setores(id) ON DELETE SET NULL,
  data_entrada    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_saida      TIMESTAMPTZ,
  porteiro_id     BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao      VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_visita_intervalo CHECK (data_saida IS NULL OR data_saida >= data_entrada)
);

CREATE UNIQUE INDEX uq_visitas_uuid     ON visitas (uuid_externo);
CREATE INDEX ix_visitas_paciente   ON visitas (paciente_id, data_entrada DESC);
CREATE INDEX ix_visitas_visitante  ON visitas (visitante_id, data_entrada DESC);
CREATE INDEX ix_visitas_leito_ativ ON visitas (leito_id) WHERE data_saida IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Trigger — movimentação atualiza etapa_atual + ultima_movimentacao
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_cme_movimentacao_atualiza_artigo() RETURNS TRIGGER AS $$
BEGIN
  UPDATE cme_artigos
     SET etapa_atual         = NEW.etapa_destino,
         ultima_movimentacao = NEW.data_hora,
         updated_at          = now()
   WHERE id = NEW.artigo_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_cme_movimentacao_atualiza_artigo
  AFTER INSERT ON cme_movimentacoes
  FOR EACH ROW EXECUTE FUNCTION fn_cme_movimentacao_atualiza_artigo();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Trigger — lote CME pós-LIBERADO/REPROVADO é parcialmente imutável (RN-CME-01)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_cme_lote_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('LIBERADO', 'REPROVADO') THEN
    -- Permite apenas mudar status para EXPIRADO (validade) ou marcar deleted_at
    IF NEW.status NOT IN (OLD.status, 'EXPIRADO')
       OR NEW.numero <> OLD.numero
       OR NEW.metodo <> OLD.metodo
       OR NEW.data_esterilizacao <> OLD.data_esterilizacao
       OR NEW.indicador_biologico_ok IS DISTINCT FROM OLD.indicador_biologico_ok
       OR NEW.indicador_quimico_ok IS DISTINCT FROM OLD.indicador_quimico_ok
    THEN
      RAISE EXCEPTION 'RN-CME-01: lote CME % está % e é parcialmente imutável.',
        OLD.numero, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'LIBERADO' THEN
    RAISE EXCEPTION 'RN-CME-01: lote CME % LIBERADO não pode ser deletado.', OLD.numero
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_cme_lote_imutavel
  BEFORE UPDATE OR DELETE ON cme_lotes
  FOR EACH ROW EXECUTE FUNCTION fn_cme_lote_imutavel();

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Trigger — visitante bloqueado não pode entrar (RN-VIS-03)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_visita_valida_visitante() RETURNS TRIGGER AS $$
DECLARE
  v_bloqueado BOOLEAN;
  v_motivo VARCHAR(200);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT bloqueado, motivo_bloqueio
      INTO v_bloqueado, v_motivo
      FROM visitantes
     WHERE id = NEW.visitante_id;

    IF v_bloqueado IS TRUE THEN
      RAISE EXCEPTION 'RN-VIS-03: visitante % está bloqueado (motivo: %).',
        NEW.visitante_id, COALESCE(v_motivo, 'não informado')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_visita_valida_visitante
  BEFORE INSERT ON visitas
  FOR EACH ROW EXECUTE FUNCTION fn_visita_valida_visitante();

-- ═══════════════════════════════════════════════════════════════════════
-- 9. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cme_lotes          FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cme_artigos        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON cme_movimentacoes  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON ccih_casos         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON same_prontuarios   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON same_emprestimos   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON visitantes         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON visitas            FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 10. RLS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE cme_lotes          ENABLE ROW LEVEL SECURITY;  ALTER TABLE cme_lotes          FORCE ROW LEVEL SECURITY;
ALTER TABLE cme_artigos        ENABLE ROW LEVEL SECURITY;  ALTER TABLE cme_artigos        FORCE ROW LEVEL SECURITY;
ALTER TABLE cme_movimentacoes  ENABLE ROW LEVEL SECURITY;  ALTER TABLE cme_movimentacoes  FORCE ROW LEVEL SECURITY;
ALTER TABLE ccih_casos         ENABLE ROW LEVEL SECURITY;  ALTER TABLE ccih_casos         FORCE ROW LEVEL SECURITY;
ALTER TABLE same_prontuarios   ENABLE ROW LEVEL SECURITY;  ALTER TABLE same_prontuarios   FORCE ROW LEVEL SECURITY;
ALTER TABLE same_emprestimos   ENABLE ROW LEVEL SECURITY;  ALTER TABLE same_emprestimos   FORCE ROW LEVEL SECURITY;
ALTER TABLE visitantes         ENABLE ROW LEVEL SECURITY;  ALTER TABLE visitantes         FORCE ROW LEVEL SECURITY;
ALTER TABLE visitas            ENABLE ROW LEVEL SECURITY;  ALTER TABLE visitas            FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON cme_lotes          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cme_artigos        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON cme_movimentacoes  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON ccih_casos         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON same_prontuarios   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON same_emprestimos   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON visitantes         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON visitas            USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('cme',         'read',         'Listar lotes/artigos CME'),
  ('cme',         'write',        'Criar lote / movimentar artigo'),
  ('cme',         'liberar',      'Liberar lote (após indicador biológico)'),
  ('cme',         'reprovar',     'Reprovar lote (falha de indicador)'),
  ('ccih',        'read',         'Listar casos IRAS + indicadores'),
  ('ccih',        'write',        'Registrar caso / atualizar antibiograma'),
  ('ccih',        'notificar',    'Marcar notificação compulsória'),
  ('ccih',        'encerrar',     'Encerrar caso'),
  ('same',        'read',         'Listar prontuários físicos'),
  ('same',        'write',        'Criar/atualizar prontuário (localização, digitalização)'),
  ('same',        'emprestar',    'Registrar empréstimo'),
  ('same',        'devolver',     'Registrar devolução'),
  ('visitantes',  'read',         'Listar visitantes'),
  ('visitantes',  'write',        'Cadastrar/editar visitante'),
  ('visitantes',  'bloquear',     'Bloquear/desbloquear visitante'),
  ('visitas',     'read',         'Listar visitas'),
  ('visitas',     'registrar',    'Registrar entrada/saída de visitante')
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
       AND perm.recurso IN ('cme','ccih','same','visitantes','visitas')
    ON CONFLICT DO NOTHING;
    -- ENFERMEIRO: CME (read/write/liberar) + CCIH (read/write) + visitas (registrar/read)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ENFERMEIRO'
       AND ((perm.recurso='cme' AND perm.acao IN ('read','write','liberar','reprovar'))
         OR (perm.recurso='ccih' AND perm.acao IN ('read','write'))
         OR (perm.recurso='visitas' AND perm.acao IN ('read','registrar')))
    ON CONFLICT DO NOTHING;
    -- MEDICO: ler CCIH + same (do paciente em atendimento)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='ccih' AND perm.acao IN ('read','write','notificar'))
         OR (perm.recurso='same' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
