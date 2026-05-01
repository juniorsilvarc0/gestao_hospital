-- ============================================================================
-- Fase 8 — Faturamento + TISS + Glosas
--
-- Tabelas novas:
--   - pacotes + pacotes_itens
--   - lotes_tiss
--   - guias_tiss
--   - glosas
--
-- ALTERs:
--   - contas: snapshots (versao_tiss, condicao_contratual, tabela_precos),
--     valores granulares por grupo_gasto, iss, ck_contas_liquido
--   - contas_itens: FKs pacote_id, guia_tiss_id (que eram BIGINT sem REFERENCES)
--
-- Triggers:
--   - tg_atualiza_totais_conta: recalcula valor_total + valores granulares
--     por grupo_gasto a partir de contas_itens (RN-FAT-01/RN-FAT-07)
--   - tg_glosa_atualiza_conta: atualiza valor_glosa e valor_recurso_revertido
--     (RN-GLO-04)
--
-- Invariantes:
--   #1 Conta fechada não pode ter contas_itens alterado (trigger)
--   #2 Item glosado: valor_glosa <= contas_itens.valor_total
--   #3 Lote TISS imutável após status='ENVIADO' (trigger)
--   #4 Guia TISS imutável após status IN ('VALIDADA','ENVIADA','ACEITA') (trigger)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_lote_tiss_status AS ENUM (
  'EM_PREPARACAO',
  'GERADO',
  'VALIDADO',
  'ENVIADO',
  'PROCESSADO',
  'COM_ERRO'
);

CREATE TYPE enum_guia_tiss_tipo AS ENUM (
  'CONSULTA',
  'SP_SADT',
  'INTERNACAO',
  'HONORARIOS',
  'OUTRAS_DESPESAS',
  'RESUMO_INTERNACAO',
  'ANEXO_OPME'
);

CREATE TYPE enum_guia_tiss_status AS ENUM (
  'GERADA',
  'VALIDADA',
  'ENVIADA',
  'ACEITA',
  'RECUSADA',
  'GLOSADA'
);

CREATE TYPE enum_glosa_status AS ENUM (
  'RECEBIDA',
  'EM_ANALISE',
  'EM_RECURSO',
  'ACATADA',
  'REVERTIDA_TOTAL',
  'REVERTIDA_PARCIAL',
  'PERDA_DEFINITIVA'
);

CREATE TYPE enum_glosa_origem AS ENUM (
  'TISS',
  'MANUAL'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. pacotes + pacotes_itens
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE pacotes (
  id                        BIGSERIAL PRIMARY KEY,
  uuid_externo              UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                 BIGINT NOT NULL,
  codigo                    VARCHAR(40) NOT NULL,
  nome                      VARCHAR(300) NOT NULL,
  descricao                 TEXT,
  procedimento_principal_id BIGINT REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  convenio_id               BIGINT REFERENCES convenios(id) ON DELETE RESTRICT,
  valor_total               DECIMAL(18,4) NOT NULL,
  vigencia_inicio           DATE NOT NULL,
  vigencia_fim              DATE,
  ativo                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT,
  updated_at                TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ,
  CONSTRAINT uq_pacotes UNIQUE (tenant_id, codigo),
  CONSTRAINT ck_pacote_valor CHECK (valor_total >= 0),
  CONSTRAINT ck_pacote_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE UNIQUE INDEX uq_pacotes_uuid ON pacotes (uuid_externo);
CREATE INDEX ix_pacotes_proc_princ ON pacotes (procedimento_principal_id, vigencia_inicio DESC);
CREATE INDEX ix_pacotes_convenio   ON pacotes (convenio_id, ativo) WHERE deleted_at IS NULL;

CREATE TABLE pacotes_itens (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL,
  pacote_id         BIGINT NOT NULL REFERENCES pacotes(id) ON DELETE CASCADE,
  procedimento_id   BIGINT NOT NULL REFERENCES tabelas_procedimentos(id) ON DELETE RESTRICT,
  quantidade        DECIMAL(18,6) NOT NULL DEFAULT 1,
  faixa_inicio      VARCHAR(20),
  faixa_fim         VARCHAR(20),
  CONSTRAINT uq_pi UNIQUE (pacote_id, procedimento_id),
  CONSTRAINT ck_pi_qtd CHECK (quantidade > 0)
);

CREATE INDEX ix_pi_pacote ON pacotes_itens (pacote_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. lotes_tiss
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE lotes_tiss (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  convenio_id         BIGINT NOT NULL REFERENCES convenios(id) ON DELETE RESTRICT,
  numero_lote         VARCHAR(20) NOT NULL,
  versao_tiss         VARCHAR(10) NOT NULL,
  competencia         VARCHAR(7) NOT NULL,                          -- AAAA-MM
  data_geracao        TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validacao      TIMESTAMPTZ,
  data_envio          TIMESTAMPTZ,
  data_processamento  TIMESTAMPTZ,
  qtd_guias           INTEGER NOT NULL DEFAULT 0,
  valor_total         DECIMAL(18,4) NOT NULL DEFAULT 0,
  hash_xml            VARCHAR(64),                                  -- SHA-256
  xml_url             VARCHAR(500),                                 -- S3/MinIO
  protocolo_operadora VARCHAR(40),
  status              enum_lote_tiss_status NOT NULL DEFAULT 'EM_PREPARACAO',
  validacao_xsd_erros JSONB,
  lote_anterior_id    BIGINT REFERENCES lotes_tiss(id) ON DELETE SET NULL,
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT,
  updated_at          TIMESTAMPTZ,
  CONSTRAINT uq_lote UNIQUE (tenant_id, convenio_id, numero_lote),
  CONSTRAINT ck_lote_competencia CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_lote_qtd CHECK (qtd_guias >= 0),
  CONSTRAINT ck_lote_valor CHECK (valor_total >= 0)
);

CREATE UNIQUE INDEX uq_lotes_tiss_uuid ON lotes_tiss (uuid_externo);
CREATE INDEX ix_lotes_status         ON lotes_tiss (tenant_id, status, data_geracao DESC);
CREATE INDEX ix_lotes_convenio_comp  ON lotes_tiss (convenio_id, competencia);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. guias_tiss
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE guias_tiss (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  conta_id                 BIGINT NOT NULL REFERENCES contas(id) ON DELETE RESTRICT,
  lote_id                  BIGINT REFERENCES lotes_tiss(id) ON DELETE SET NULL,
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
  data_validacao           TIMESTAMPTZ,
  data_envio               TIMESTAMPTZ,
  data_resposta            TIMESTAMPTZ,
  motivo_recusa            VARCHAR(500),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  CONSTRAINT uq_guias_numero UNIQUE (tenant_id, numero_guia_prestador),
  CONSTRAINT ck_guia_valor   CHECK (valor_total >= 0)
);

CREATE UNIQUE INDEX uq_guias_tiss_uuid ON guias_tiss (uuid_externo);
CREATE INDEX ix_guias_lote   ON guias_tiss (lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX ix_guias_status ON guias_tiss (tenant_id, status, data_geracao DESC);
CREATE INDEX ix_guias_conta  ON guias_tiss (conta_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. glosas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE glosas (
  id                    BIGSERIAL PRIMARY KEY,
  uuid_externo          UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id             BIGINT NOT NULL,
  conta_id              BIGINT NOT NULL REFERENCES contas(id) ON DELETE RESTRICT,
  conta_item_id         BIGINT REFERENCES contas_itens(id) ON DELETE SET NULL,
  guia_tiss_id          BIGINT REFERENCES guias_tiss(id) ON DELETE SET NULL,
  convenio_id           BIGINT NOT NULL REFERENCES convenios(id) ON DELETE RESTRICT,
  motivo                VARCHAR(500) NOT NULL,
  codigo_glosa_tiss     VARCHAR(10),
  valor_glosado         DECIMAL(18,4) NOT NULL,
  data_glosa            DATE NOT NULL,
  origem                enum_glosa_origem NOT NULL DEFAULT 'TISS',
  -- Recurso (RN-GLO-03):
  prazo_recurso         DATE,
  recurso               TEXT,
  data_recurso          DATE,
  recurso_documento_url VARCHAR(500),
  recurso_por           BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Resposta:
  status                enum_glosa_status NOT NULL DEFAULT 'RECEBIDA',
  valor_revertido       DECIMAL(18,4) NOT NULL DEFAULT 0,
  data_resposta_recurso DATE,
  motivo_resposta       VARCHAR(500),
  -- Audit:
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT,
  updated_at            TIMESTAMPTZ,
  CONSTRAINT ck_glosa_valor CHECK (valor_glosado >= 0),
  CONSTRAINT ck_glosa_revertido CHECK (valor_revertido >= 0 AND valor_revertido <= valor_glosado)
);

CREATE UNIQUE INDEX uq_glosas_uuid ON glosas (uuid_externo);
CREATE INDEX ix_glosas_conta  ON glosas (conta_id);
CREATE INDEX ix_glosas_status ON glosas (tenant_id, status, data_glosa DESC);
CREATE INDEX ix_glosas_prazo  ON glosas (prazo_recurso) WHERE status IN ('RECEBIDA','EM_ANALISE','EM_RECURSO');

-- ═══════════════════════════════════════════════════════════════════════
-- 6. ALTER contas — snapshots + valores granulares + ISS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE contas
  ADD COLUMN versao_tiss_snapshot     VARCHAR(10),
  ADD COLUMN condicao_contratual_snap JSONB,
  ADD COLUMN tabela_precos_snap       JSONB,
  ADD COLUMN valor_procedimentos      DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_diarias            DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_taxas              DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_servicos           DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_materiais          DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_medicamentos       DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_opme               DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_gases              DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_pacotes            DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN valor_honorarios         DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN iss_aliquota_snap        DECIMAL(7,4),
  ADD COLUMN iss_valor                DECIMAL(18,4),
  ADD COLUMN iss_retem                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN numero_guia_principal    VARCHAR(30),
  ADD COLUMN data_elaboracao_inicio   TIMESTAMPTZ,
  ADD COLUMN data_elaboracao_fim      TIMESTAMPTZ,
  ADD COLUMN inconsistencias          JSONB;                          -- snapshot da última elaboração

-- Recalcular valor_liquido para refletir novos campos
ALTER TABLE contas DROP CONSTRAINT IF EXISTS ck_contas_liquido;
ALTER TABLE contas
  ADD CONSTRAINT ck_contas_liquido
  CHECK (valor_liquido = valor_total - valor_glosa + valor_recurso_revertido);

-- Índice em data_fechamento (competência é derivada na aplicação)
CREATE INDEX ix_contas_data_fechamento ON contas (data_fechamento)
  WHERE data_fechamento IS NOT NULL AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. ALTER contas_itens — promover pacote_id e guia_tiss_id para FK reais
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE contas_itens
  ADD CONSTRAINT fk_contas_itens_pacote
  FOREIGN KEY (pacote_id) REFERENCES pacotes(id) ON DELETE SET NULL;

ALTER TABLE contas_itens
  ADD CONSTRAINT fk_contas_itens_guia_tiss
  FOREIGN KEY (guia_tiss_id) REFERENCES guias_tiss(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Trigger — atualiza totais da conta a partir de contas_itens
--    (idempotente — sempre recalcula somatório)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_atualiza_totais_conta() RETURNS TRIGGER AS $$
DECLARE
  v_conta_id BIGINT;
BEGIN
  v_conta_id := COALESCE(NEW.conta_id, OLD.conta_id);

  UPDATE contas SET
    valor_procedimentos = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'PROCEDIMENTO' AND ci.deleted_at IS NULL), 0),
    valor_diarias       = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'DIARIA'       AND ci.deleted_at IS NULL), 0),
    valor_taxas         = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'TAXA'         AND ci.deleted_at IS NULL), 0),
    valor_servicos      = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'SERVICO'      AND ci.deleted_at IS NULL), 0),
    valor_materiais     = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'MATERIAL'     AND ci.deleted_at IS NULL), 0),
    valor_medicamentos  = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'MEDICAMENTO'  AND ci.deleted_at IS NULL), 0),
    valor_opme          = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'OPME'         AND ci.deleted_at IS NULL), 0),
    valor_gases         = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'GAS'          AND ci.deleted_at IS NULL), 0),
    valor_pacotes       = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'PACOTE'       AND ci.deleted_at IS NULL), 0),
    valor_honorarios    = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.grupo_gasto = 'HONORARIO'    AND ci.deleted_at IS NULL), 0),
    valor_total         = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.deleted_at IS NULL), 0),
    valor_liquido       = COALESCE((SELECT SUM(ci.valor_total) FROM contas_itens ci WHERE ci.conta_id = v_conta_id AND ci.deleted_at IS NULL), 0)
                          - valor_glosa
                          + valor_recurso_revertido,
    updated_at          = now()
  WHERE id = v_conta_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_atualiza_totais_conta
  AFTER INSERT OR UPDATE OR DELETE ON contas_itens
  FOR EACH ROW EXECUTE FUNCTION fn_atualiza_totais_conta();

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Trigger — atualiza valor_glosa / valor_recurso_revertido na conta
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_glosa_atualiza_conta() RETURNS TRIGGER AS $$
DECLARE
  v_conta_id BIGINT;
  v_valor_glosa DECIMAL(18,4);
  v_valor_revertido DECIMAL(18,4);
  v_valor_total DECIMAL(18,4);
  v_novo_status enum_conta_status;
BEGIN
  v_conta_id := COALESCE(NEW.conta_id, OLD.conta_id);

  SELECT
    COALESCE(SUM(g.valor_glosado), 0),
    COALESCE(SUM(g.valor_revertido), 0)
    INTO v_valor_glosa, v_valor_revertido
   FROM glosas g
   WHERE g.conta_id = v_conta_id
     AND g.status NOT IN ('REVERTIDA_TOTAL'); -- glosas totalmente revertidas saem do "perdido"

  SELECT valor_total INTO v_valor_total FROM contas WHERE id = v_conta_id;

  UPDATE contas SET
    valor_glosa             = v_valor_glosa,
    valor_recurso_revertido = v_valor_revertido,
    valor_liquido           = v_valor_total - v_valor_glosa + v_valor_revertido,
    updated_at              = now()
  WHERE id = v_conta_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_glosa_atualiza_conta
  AFTER INSERT OR UPDATE OR DELETE ON glosas
  FOR EACH ROW EXECUTE FUNCTION fn_glosa_atualiza_conta();

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Trigger — lote TISS imutável após ENVIADO (RN-FAT-04)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_lote_tiss_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'ENVIADO' AND TG_OP = 'UPDATE' THEN
    -- Permitir apenas atualizar protocolo_operadora, data_processamento e status para PROCESSADO/COM_ERRO
    IF NEW.numero_lote <> OLD.numero_lote
       OR NEW.versao_tiss <> OLD.versao_tiss
       OR NEW.competencia <> OLD.competencia
       OR NEW.qtd_guias <> OLD.qtd_guias
       OR NEW.valor_total <> OLD.valor_total
       OR NEW.hash_xml IS DISTINCT FROM OLD.hash_xml
       OR NEW.xml_url IS DISTINCT FROM OLD.xml_url
       OR NEW.convenio_id <> OLD.convenio_id
    THEN
      RAISE EXCEPTION 'RN-FAT-04: lote TISS % está ENVIADO e é imutável. Para reenviar, crie novo lote com lote_anterior_id=%.',
        OLD.numero_lote, OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status IN ('ENVIADO', 'PROCESSADO') THEN
    RAISE EXCEPTION 'RN-FAT-04: lote TISS % não pode ser deletado (status=%).', OLD.numero_lote, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_lote_tiss_imutavel
  BEFORE UPDATE OR DELETE ON lotes_tiss
  FOR EACH ROW EXECUTE FUNCTION fn_lote_tiss_imutavel();

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Trigger — guia TISS imutável após VALIDADA/ENVIADA/ACEITA
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_guia_tiss_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('VALIDADA', 'ENVIADA', 'ACEITA') THEN
    -- Apenas status pode mudar (para refletir resposta da operadora) e dados de resposta
    IF NEW.numero_guia_prestador <> OLD.numero_guia_prestador
       OR NEW.tipo_guia <> OLD.tipo_guia
       OR NEW.versao_tiss <> OLD.versao_tiss
       OR NEW.xml_conteudo IS DISTINCT FROM OLD.xml_conteudo
       OR NEW.hash_xml IS DISTINCT FROM OLD.hash_xml
       OR NEW.valor_total <> OLD.valor_total
       OR NEW.conta_id <> OLD.conta_id
    THEN
      RAISE EXCEPTION 'RN-FAT-04: guia TISS % é imutável após status %. Crie nova guia para corrigir.',
        OLD.numero_guia_prestador, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status IN ('ENVIADA', 'ACEITA', 'GLOSADA') THEN
    RAISE EXCEPTION 'RN-FAT-04: guia TISS % não pode ser deletada (status=%).',
      OLD.numero_guia_prestador, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_guia_tiss_imutavel
  BEFORE UPDATE OR DELETE ON guias_tiss
  FOR EACH ROW EXECUTE FUNCTION fn_guia_tiss_imutavel();

-- ═══════════════════════════════════════════════════════════════════════
-- 12. tg_audit em todas as novas tabelas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON pacotes        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON pacotes_itens  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON lotes_tiss     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON guias_tiss     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON glosas         FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 13. RLS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE pacotes        ENABLE ROW LEVEL SECURITY;  ALTER TABLE pacotes        FORCE ROW LEVEL SECURITY;
ALTER TABLE pacotes_itens  ENABLE ROW LEVEL SECURITY;  ALTER TABLE pacotes_itens  FORCE ROW LEVEL SECURITY;
ALTER TABLE lotes_tiss     ENABLE ROW LEVEL SECURITY;  ALTER TABLE lotes_tiss     FORCE ROW LEVEL SECURITY;
ALTER TABLE guias_tiss     ENABLE ROW LEVEL SECURITY;  ALTER TABLE guias_tiss     FORCE ROW LEVEL SECURITY;
ALTER TABLE glosas         ENABLE ROW LEVEL SECURITY;  ALTER TABLE glosas         FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON pacotes        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON pacotes_itens  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON lotes_tiss     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON guias_tiss     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON glosas         USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 14. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('contas',           'read',         'Listar/ler contas'),
  ('contas',           'write',        'Lançar item / editar conta'),
  ('contas',           'elaborar',     'Iniciar elaboração de conta'),
  ('contas',           'recalcular',   'Disparar recálculo idempotente'),
  ('contas',           'fechar',       'Fechar conta (gera snapshots)'),
  ('contas',           'reabrir',      'Reabrir conta fechada'),
  ('contas',           'espelho',      'Gerar espelho PDF/JSON'),
  ('contas',           'cancelar',     'Cancelar conta'),
  ('pacotes',          'read',         'Listar pacotes'),
  ('pacotes',          'write',        'Criar/editar pacotes'),
  ('tiss',             'read',         'Listar guias e lotes TISS'),
  ('tiss',             'gerar_guia',   'Gerar guia TISS para conta'),
  ('tiss',             'criar_lote',   'Criar lote TISS'),
  ('tiss',             'validar_lote', 'Validar lote contra XSD'),
  ('tiss',             'enviar_lote',  'Enviar lote ao convênio'),
  ('tiss',             'protocolo',    'Registrar protocolo de retorno'),
  ('glosas',           'read',         'Listar glosas'),
  ('glosas',           'write',        'Lançar glosa manual'),
  ('glosas',           'importar',     'Importar retorno TISS'),
  ('glosas',           'recurso',      'Cadastrar recurso de glosa'),
  ('glosas',           'finalizar',    'Finalizar ciclo de glosa')
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
       AND perm.recurso IN ('contas','pacotes','tiss','glosas')
    ON CONFLICT DO NOTHING;
    -- FATURISTA: contas + tiss + glosas (write completo, exceto reabrir/cancelar)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='FATURISTA'
       AND ((perm.recurso='contas' AND perm.acao IN ('read','write','elaborar','recalcular','fechar','espelho'))
         OR (perm.recurso='pacotes' AND perm.acao='read')
         OR (perm.recurso='tiss' AND perm.acao IN ('read','gerar_guia','criar_lote','validar_lote','enviar_lote','protocolo'))
         OR (perm.recurso='glosas' AND perm.acao IN ('read','write','importar','recurso','finalizar')))
    ON CONFLICT DO NOTHING;
    -- MEDICO: ler contas (suas) e glosas; sem editar
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='contas' AND perm.acao IN ('read','espelho'))
         OR (perm.recurso='glosas' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
    -- ENFERMEIRO: ler contas (sem editar)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ENFERMEIRO'
       AND (perm.recurso='contas' AND perm.acao='read')
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
