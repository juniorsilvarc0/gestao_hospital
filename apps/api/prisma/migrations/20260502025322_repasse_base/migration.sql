-- ============================================================================
-- Fase 9 — Repasse Médico
--
-- Tabelas novas:
--   - criterios_repasse (regras versionadas + JSONB de matchers/deducoes/acrescimos)
--   - repasses (cabeçalho mensal por prestador × competência)
--   - repasses_itens (snapshot por item de conta com critério aplicado)
--
-- Invariantes:
--   #1 Repasse PAGO é imutável (trigger)
--   #2 valor_liquido = valor_bruto + valor_creditos - valor_debitos - valor_descontos - valor_impostos
--   #3 Critério não pode ter vigencia_fim < vigencia_inicio
--   #4 Snapshot do critério aplicado fica em repasses_itens.criterio_id +
--      campos calculados (base_calculo, percentual, valor_fixo, valor_calculado)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_repasse_tipo_base_calculo AS ENUM (
  'VALOR_TOTAL',
  'VALOR_COM_DEDUCOES',
  'VALOR_COM_ACRESCIMOS',
  'VALOR_LIQUIDO_PAGO'
);

CREATE TYPE enum_repasse_momento AS ENUM (
  'AO_FATURAR',
  'AO_CONFIRMAR_RECEBIMENTO',
  'COM_PRAZO_DEFINIDO'
);

CREATE TYPE enum_repasse_status AS ENUM (
  'APURADO',
  'CONFERIDO',
  'LIBERADO',
  'PAGO',
  'CANCELADO'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. criterios_repasse — regras versionadas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE criterios_repasse (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL,
  descricao                VARCHAR(200) NOT NULL,
  vigencia_inicio          DATE NOT NULL,
  vigencia_fim             DATE,
  unidade_faturamento_id   BIGINT REFERENCES unidades_faturamento(id) ON DELETE RESTRICT,
  unidade_atendimento_id   BIGINT REFERENCES unidades_atendimento(id) ON DELETE RESTRICT,
  tipo_base_calculo        enum_repasse_tipo_base_calculo NOT NULL,
  momento_repasse          enum_repasse_momento NOT NULL,
  dia_fechamento           INTEGER,
  prazo_dias               INTEGER,
  prioridade               INTEGER NOT NULL DEFAULT 1,
  regras                   JSONB NOT NULL,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT,
  updated_at               TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT ck_criterio_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT ck_criterio_dia      CHECK (dia_fechamento IS NULL OR (dia_fechamento BETWEEN 1 AND 31)),
  CONSTRAINT ck_criterio_prazo    CHECK (prazo_dias IS NULL OR prazo_dias >= 0),
  CONSTRAINT ck_criterio_prio     CHECK (prioridade >= 1)
);

CREATE UNIQUE INDEX uq_criterios_repasse_uuid ON criterios_repasse (uuid_externo);
CREATE INDEX ix_criterios_vigencia ON criterios_repasse (tenant_id, ativo, vigencia_inicio DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_criterios_uf       ON criterios_repasse (unidade_faturamento_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_criterios_ua       ON criterios_repasse (unidade_atendimento_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. repasses — cabeçalho por prestador × competência
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE repasses (
  id                 BIGSERIAL PRIMARY KEY,
  uuid_externo       UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id          BIGINT NOT NULL,
  prestador_id       BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  competencia        VARCHAR(7) NOT NULL,                            -- AAAA-MM
  data_apuracao      TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conferencia   TIMESTAMPTZ,
  conferido_por      BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_liberacao     TIMESTAMPTZ,
  liberado_por       BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_pagamento     TIMESTAMPTZ,
  pago_por           BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  valor_bruto        DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_creditos     DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_debitos      DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_descontos    DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_impostos     DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_liquido      DECIMAL(18,4) NOT NULL DEFAULT 0,
  status             enum_repasse_status NOT NULL DEFAULT 'APURADO',
  cancelado_em       TIMESTAMPTZ,
  cancelado_motivo   VARCHAR(500),
  observacao         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         BIGINT,
  updated_at         TIMESTAMPTZ,
  CONSTRAINT uq_repasse UNIQUE (tenant_id, prestador_id, competencia),
  CONSTRAINT ck_repasse_competencia CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_repasse_valores CHECK (
    valor_bruto >= 0 AND valor_creditos >= 0 AND valor_debitos >= 0
    AND valor_descontos >= 0 AND valor_impostos >= 0
  )
);

CREATE UNIQUE INDEX uq_repasses_uuid ON repasses (uuid_externo);
CREATE INDEX ix_repasses_status      ON repasses (tenant_id, status, competencia DESC);
CREATE INDEX ix_repasses_prestador   ON repasses (prestador_id, competencia DESC);
CREATE INDEX ix_repasses_competencia ON repasses (tenant_id, competencia);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. repasses_itens — snapshot por item de conta
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE repasses_itens (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  repasse_id          BIGINT NOT NULL REFERENCES repasses(id) ON DELETE CASCADE,
  conta_id            BIGINT NOT NULL REFERENCES contas(id) ON DELETE RESTRICT,
  conta_item_id       BIGINT REFERENCES contas_itens(id) ON DELETE SET NULL,
  cirurgia_id         BIGINT REFERENCES cirurgias(id) ON DELETE SET NULL,
  criterio_id         BIGINT REFERENCES criterios_repasse(id) ON DELETE SET NULL,
  funcao              VARCHAR(40),                              -- CIRURGIAO, ANESTESISTA, AUXILIAR, INSTRUMENTADOR, EXECUTANTE
  base_calculo        DECIMAL(18,4) NOT NULL,
  percentual          DECIMAL(7,4),
  valor_fixo          DECIMAL(18,4),
  valor_calculado     DECIMAL(18,4) NOT NULL,
  -- Snapshot do critério no momento da apuração (auditável):
  criterio_snapshot   JSONB,
  -- Reapuração (RN-REP-06): item refeito após reversão de glosa
  reapurado_de_id     BIGINT REFERENCES repasses_itens(id) ON DELETE SET NULL,
  glosado             BOOLEAN NOT NULL DEFAULT FALSE,
  observacao          VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_ri_base    CHECK (base_calculo >= 0),
  CONSTRAINT ck_ri_calc    CHECK (valor_calculado >= 0),
  CONSTRAINT ck_ri_pct     CHECK (percentual IS NULL OR (percentual >= 0 AND percentual <= 100)),
  CONSTRAINT ck_ri_fixo    CHECK (valor_fixo IS NULL OR valor_fixo >= 0)
);

CREATE UNIQUE INDEX uq_repasses_itens_uuid ON repasses_itens (uuid_externo);
CREATE INDEX ix_ri_repasse    ON repasses_itens (repasse_id);
CREATE INDEX ix_ri_conta      ON repasses_itens (conta_id);
CREATE INDEX ix_ri_conta_item ON repasses_itens (conta_item_id) WHERE conta_item_id IS NOT NULL;
CREATE INDEX ix_ri_cirurgia   ON repasses_itens (cirurgia_id) WHERE cirurgia_id IS NOT NULL;
CREATE INDEX ix_ri_criterio   ON repasses_itens (criterio_id) WHERE criterio_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Trigger — atualiza totais do repasse (idempotente)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_atualiza_totais_repasse() RETURNS TRIGGER AS $$
DECLARE
  v_repasse_id BIGINT;
BEGIN
  v_repasse_id := COALESCE(NEW.repasse_id, OLD.repasse_id);

  UPDATE repasses SET
    valor_bruto = COALESCE((
      SELECT SUM(ri.valor_calculado)
        FROM repasses_itens ri
       WHERE ri.repasse_id = v_repasse_id
         AND ri.glosado = FALSE
    ), 0),
    valor_liquido = COALESCE((
      SELECT SUM(ri.valor_calculado)
        FROM repasses_itens ri
       WHERE ri.repasse_id = v_repasse_id
         AND ri.glosado = FALSE
    ), 0)
    + valor_creditos - valor_debitos - valor_descontos - valor_impostos,
    updated_at = now()
   WHERE id = v_repasse_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_atualiza_totais_repasse
  AFTER INSERT OR UPDATE OR DELETE ON repasses_itens
  FOR EACH ROW EXECUTE FUNCTION fn_atualiza_totais_repasse();

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Trigger — repasse PAGO é imutável (RN-REP-05)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_repasse_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'PAGO' THEN
    -- Apenas observação e cancelamento → CANCELADO permitidos
    IF NEW.status NOT IN ('PAGO', 'CANCELADO') THEN
      RAISE EXCEPTION 'RN-REP-05: repasse PAGO é imutável (uuid=%). Para estornar, registre item glosado no próximo ciclo (RN-REP-06).',
        OLD.uuid_externo
        USING ERRCODE = 'check_violation';
    END IF;
    -- Bloqueia mudança de valores quando PAGO:
    IF NEW.valor_bruto       <> OLD.valor_bruto
       OR NEW.valor_creditos <> OLD.valor_creditos
       OR NEW.valor_debitos  <> OLD.valor_debitos
       OR NEW.valor_descontos <> OLD.valor_descontos
       OR NEW.valor_impostos <> OLD.valor_impostos
       OR NEW.valor_liquido  <> OLD.valor_liquido
       OR NEW.competencia    <> OLD.competencia
       OR NEW.prestador_id   <> OLD.prestador_id
    THEN
      RAISE EXCEPTION 'RN-REP-05: valores e identidade do repasse PAGO % são imutáveis.', OLD.uuid_externo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status IN ('LIBERADO', 'PAGO') THEN
    RAISE EXCEPTION 'RN-REP-05: repasse % não pode ser deletado (status=%).',
      OLD.uuid_externo, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_repasse_imutavel
  BEFORE UPDATE OR DELETE ON repasses
  FOR EACH ROW EXECUTE FUNCTION fn_repasse_imutavel();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON criterios_repasse  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON repasses           FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON repasses_itens     FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 8. RLS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE criterios_repasse ENABLE ROW LEVEL SECURITY;  ALTER TABLE criterios_repasse FORCE ROW LEVEL SECURITY;
ALTER TABLE repasses          ENABLE ROW LEVEL SECURITY;  ALTER TABLE repasses          FORCE ROW LEVEL SECURITY;
ALTER TABLE repasses_itens    ENABLE ROW LEVEL SECURITY;  ALTER TABLE repasses_itens    FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON criterios_repasse USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON repasses          USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON repasses_itens    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('repasse_criterios', 'read',      'Listar critérios de repasse'),
  ('repasse_criterios', 'write',     'Criar/editar critérios'),
  ('repasse',           'read',      'Listar repasses'),
  ('repasse',           'apurar',    'Disparar apuração mensal'),
  ('repasse',           'reapurar',  'Reapurar após reversão de glosa (RN-REP-06)'),
  ('repasse',           'conferir',  'Conferir repasse (APURADO → CONFERIDO)'),
  ('repasse',           'liberar',   'Liberar repasse (CONFERIDO → LIBERADO)'),
  ('repasse',           'marcar_pago', 'Marcar como PAGO'),
  ('repasse',           'cancelar',  'Cancelar repasse'),
  ('repasse_folha',     'read',      'Folha de produção do prestador')
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
       AND perm.recurso IN ('repasse_criterios','repasse','repasse_folha')
    ON CONFLICT DO NOTHING;
    -- FATURISTA: tudo exceto cancelar
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='FATURISTA'
       AND ((perm.recurso='repasse_criterios' AND perm.acao IN ('read','write'))
         OR (perm.recurso='repasse' AND perm.acao IN ('read','apurar','reapurar','conferir','liberar','marcar_pago'))
         OR (perm.recurso='repasse_folha' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
    -- MEDICO: ler própria folha + repasses
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='repasse' AND perm.acao='read')
         OR (perm.recurso='repasse_folha' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
