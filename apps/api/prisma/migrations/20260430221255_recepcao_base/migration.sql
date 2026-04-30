-- ─────────────────────────────────────────────────────────────────────
-- Fase 5 / P0 — Recepção, Atendimento, Triagem (DB.md §7.5)
--
-- Objetivos críticos:
--   • atendimentos (raiz do ciclo clínico) com `versao` para otimistic lock.
--   • triagens (Manchester — cor + sinais vitais + queixa).
--   • contas (esqueleto mínimo — Fase 8 expande com snapshots/itens/glosas).
--   • Trigger auto-cria conta no INSERT de atendimento (pegadinha
--     da SKILL: esquecer leva a conta órfã depois).
--   • FKs retroativas em leitos.{paciente_id, atendimento_id} e em
--     acessos_prontuario.atendimento_id (eram BigInt sem REFERENCES).
-- ─────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_tipo_cobranca AS ENUM ('PARTICULAR', 'CONVENIO', 'SUS');

CREATE TYPE enum_atendimento_status AS ENUM (
  'AGENDADO', 'EM_ESPERA', 'EM_TRIAGEM', 'EM_ATENDIMENTO',
  'INTERNADO', 'ALTA', 'CANCELADO', 'NAO_COMPARECEU'
);

CREATE TYPE enum_atendimento_classificacao_risco AS ENUM (
  'VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'
);

CREATE TYPE enum_atendimento_tipo_alta AS ENUM (
  'ALTA_MEDICA', 'ALTA_PEDIDO', 'TRANSFERENCIA', 'EVASAO', 'OBITO'
);

CREATE TYPE enum_conta_status AS ENUM (
  'ABERTA', 'EM_ELABORACAO', 'FECHADA', 'FATURADA',
  'GLOSADA_PARCIAL', 'GLOSADA_TOTAL', 'PAGA', 'CANCELADA'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. atendimentos — evento clínico raiz (DB.md §7.5)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE atendimentos (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  numero_atendimento       VARCHAR(30) NOT NULL,
  paciente_id              BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  tipo                     enum_atendimento_tipo NOT NULL,
  data_hora_entrada        TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_hora_saida          TIMESTAMPTZ,
  prestador_id             BIGINT NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
  setor_id                 BIGINT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  unidade_faturamento_id   BIGINT NOT NULL REFERENCES unidades_faturamento(id) ON DELETE RESTRICT,
  unidade_atendimento_id   BIGINT NOT NULL REFERENCES unidades_atendimento(id) ON DELETE RESTRICT,
  leito_id                 BIGINT REFERENCES leitos(id) ON DELETE SET NULL,
  tipo_cobranca            enum_tipo_cobranca NOT NULL,
  paciente_convenio_id     BIGINT REFERENCES pacientes_convenios(id) ON DELETE RESTRICT,
  convenio_id              BIGINT REFERENCES convenios(id) ON DELETE RESTRICT,
  plano_id                 BIGINT REFERENCES planos(id) ON DELETE RESTRICT,
  numero_carteirinha       VARCHAR(40),
  numero_guia_operadora    VARCHAR(40),
  senha_autorizacao        VARCHAR(40),
  classificacao_risco      enum_atendimento_classificacao_risco,
  classificacao_risco_em   TIMESTAMPTZ,
  classificacao_risco_por  BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  cid_principal            VARCHAR(10),
  cids_secundarios         JSONB,
  motivo_atendimento       VARCHAR(500),
  tipo_alta                enum_atendimento_tipo_alta,
  status                   enum_atendimento_status NOT NULL DEFAULT 'EM_ESPERA',
  conta_id                 BIGINT,                                  -- FK lógica → contas (1:1), preenchida pelo trigger
  agendamento_id           BIGINT REFERENCES agendamentos(id) ON DELETE SET NULL,
  atendimento_origem_id    BIGINT REFERENCES atendimentos(id) ON DELETE SET NULL,
  observacao               TEXT,
  -- Audit + otimistic
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ,
  updated_by               BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  deleted_at               TIMESTAMPTZ,
  deleted_by               BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  versao                   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_atendimentos_numero UNIQUE (tenant_id, numero_atendimento),
  CONSTRAINT ck_atendimentos_saida CHECK (
    data_hora_saida IS NULL OR data_hora_saida >= data_hora_entrada
  ),
  CONSTRAINT ck_atendimentos_conv CHECK (
    (tipo_cobranca = 'CONVENIO' AND convenio_id IS NOT NULL AND numero_carteirinha IS NOT NULL) OR
    (tipo_cobranca <> 'CONVENIO')
  )
);
CREATE UNIQUE INDEX uq_atendimentos_uuid ON atendimentos (uuid_externo);
CREATE INDEX ix_atend_paciente_data ON atendimentos (paciente_id, data_hora_entrada DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_atend_setor_status  ON atendimentos (setor_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ix_atend_prestador     ON atendimentos (prestador_id, data_hora_entrada DESC);
CREATE INDEX ix_atend_convenio      ON atendimentos (convenio_id, data_hora_entrada DESC) WHERE convenio_id IS NOT NULL;
CREATE INDEX ix_atend_fila          ON atendimentos (setor_id, classificacao_risco, data_hora_entrada)
  WHERE status IN ('EM_ESPERA', 'EM_TRIAGEM');

-- FKs retroativas em leitos (eram BigInt sem REFERENCES porque atendimentos não existia).
ALTER TABLE leitos
  ADD CONSTRAINT fk_leitos_paciente_id FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_leitos_atendimento_id FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE SET NULL;

-- FK retroativa em acessos_prontuario.atendimento_id (também era BigInt sem REFERENCES).
-- Atenção: acessos_prontuario é PARTITIONED. ALTER TABLE FK só funciona na master.
ALTER TABLE acessos_prontuario
  ADD CONSTRAINT fk_acessos_atendimento_id FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. triagens — Manchester (cor + sinais vitais + queixa)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE triagens (
  id                BIGSERIAL PRIMARY KEY,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  atendimento_id    BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  classificacao     enum_atendimento_classificacao_risco NOT NULL,
  protocolo         VARCHAR(40) NOT NULL DEFAULT 'MANCHESTER',
  queixa_principal  TEXT NOT NULL,
  -- Sinais vitais (mesmas faixas do PEP — RN-PEP-04). Validação fisiológica
  -- na app (faixa = error 422 com flag override).
  pa_sistolica      INTEGER,            -- mmHg
  pa_diastolica     INTEGER,
  fc                INTEGER,            -- bpm
  fr                INTEGER,            -- ipm
  temperatura       DECIMAL(4,1),       -- °C
  sat_o2            INTEGER,            -- %
  glicemia          INTEGER,            -- mg/dL
  peso_kg           DECIMAL(5,2),
  altura_cm         INTEGER,
  dor_eva           SMALLINT,           -- 0..10
  observacao        TEXT,
  triagem_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  triagem_por       BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_triagem_pa CHECK (
    (pa_sistolica IS NULL AND pa_diastolica IS NULL) OR
    (pa_sistolica > pa_diastolica)
  ),
  CONSTRAINT ck_triagem_eva CHECK (dor_eva IS NULL OR dor_eva BETWEEN 0 AND 10)
);
CREATE UNIQUE INDEX uq_triagens_uuid ON triagens (uuid_externo);
CREATE INDEX ix_triagens_atendimento ON triagens (atendimento_id, triagem_em DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. contas — esqueleto mínimo (Fase 8 expande)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE contas (
  id                       BIGSERIAL PRIMARY KEY,
  uuid_externo             UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id                BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  numero_conta             VARCHAR(30) NOT NULL,
  atendimento_id           BIGINT NOT NULL REFERENCES atendimentos(id) ON DELETE RESTRICT,
  paciente_id              BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  convenio_id              BIGINT REFERENCES convenios(id) ON DELETE RESTRICT,
  plano_id                 BIGINT REFERENCES planos(id) ON DELETE RESTRICT,
  tipo_cobranca            enum_tipo_cobranca NOT NULL,
  data_abertura            TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fechamento          TIMESTAMPTZ,
  data_envio               TIMESTAMPTZ,
  -- Totais (Fase 8 popula via tg_atualiza_totais_conta a partir de contas_itens):
  valor_total              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_glosa              DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_recurso_revertido  DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_pago               DECIMAL(18,4) NOT NULL DEFAULT 0,
  valor_liquido            DECIMAL(18,4) NOT NULL DEFAULT 0,
  status                   enum_conta_status NOT NULL DEFAULT 'ABERTA',
  observacao_elaboracao    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ,
  deleted_at               TIMESTAMPTZ,
  versao                   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_contas_numero UNIQUE (tenant_id, numero_conta),
  CONSTRAINT uq_contas_atend  UNIQUE (atendimento_id),     -- 1:1 com atendimento
  CONSTRAINT ck_contas_total  CHECK (valor_total >= 0)
);
CREATE UNIQUE INDEX uq_contas_uuid ON contas (uuid_externo);
CREATE INDEX ix_contas_status ON contas (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ix_contas_convenio_data ON contas (convenio_id, data_fechamento)
  WHERE convenio_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Trigger: auto-cria conta no INSERT de atendimento (RN-FAT-01)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_atendimento_cria_conta() RETURNS TRIGGER AS $$
DECLARE
  v_numero VARCHAR(30);
  v_conta_id BIGINT;
BEGIN
  -- Número de conta = numero_atendimento (mesma sequência humana,
  -- mas com prefixo C). Fase 8 pode ajustar para sequence próprio.
  v_numero := 'C-' || NEW.numero_atendimento;
  INSERT INTO contas (
    tenant_id, numero_conta, atendimento_id, paciente_id,
    convenio_id, plano_id, tipo_cobranca
  ) VALUES (
    NEW.tenant_id, v_numero, NEW.id, NEW.paciente_id,
    NEW.convenio_id, NEW.plano_id, NEW.tipo_cobranca
  )
  RETURNING id INTO v_conta_id;
  -- Atualiza atendimento.conta_id (FK lógica)
  UPDATE atendimentos SET conta_id = v_conta_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_atendimento_cria_conta
  AFTER INSERT ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION fn_atendimento_cria_conta();

-- ═══════════════════════════════════════════════════════════════════════
-- 6. tg_audit nas novas tabelas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON atendimentos
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON triagens
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON contas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. RLS + POLICY tenant_isolation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;  ALTER TABLE atendimentos FORCE ROW LEVEL SECURITY;
ALTER TABLE triagens     ENABLE ROW LEVEL SECURITY;  ALTER TABLE triagens     FORCE ROW LEVEL SECURITY;
ALTER TABLE contas       ENABLE ROW LEVEL SECURITY;  ALTER TABLE contas       FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON atendimentos
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON triagens
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON contas
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Permissões + grant ADMIN/RECEPCAO/MEDICO/ENFERMEIRO
--    (workaround do bug recorrente: grant em transação com SET LOCAL
--    para que RLS sobre `perfis` aplique corretamente)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('atendimentos',  'read',       'Listar/ler atendimentos'),
  ('atendimentos',  'write',      'Iniciar/atualizar atendimento'),
  ('atendimentos',  'cancelar',   'Cancelar atendimento'),
  ('atendimentos',  'internar',   'Alocar leito (otimistic lock)'),
  ('atendimentos',  'transferir', 'Transferir leito/setor/atendimento'),
  ('atendimentos',  'alta',       'Dar alta + tipo'),
  ('triagem',       'write',      'Registrar triagem Manchester'),
  ('triagem',       'read',       'Ler triagens'),
  ('leitos',        'read',       'Ler mapa de leitos'),
  ('elegibilidade', 'verificar',  'Consultar webservice de elegibilidade')
ON CONFLICT (recurso, acao) DO NOTHING;

DO $$
DECLARE
  current_tenant_id BIGINT;
BEGIN
  -- Itera todos os tenants para grants idempotentes; SET LOCAL antes
  -- de cada SELECT em `perfis` (RLS).
  FOR current_tenant_id IN SELECT id FROM tenants WHERE ativo LOOP
    PERFORM set_config('app.current_tenant_id', current_tenant_id::text, TRUE);
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo IN ('ADMIN','RECEPCAO','MEDICO','ENFERMEIRO')
       AND perm.recurso IN ('atendimentos','triagem','leitos','elegibilidade')
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
