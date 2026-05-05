-- ============================================================================
-- Fase 13 — Hardening + LGPD/Auditoria + Admin global + Performance
--
-- Tabelas novas:
--   - audit_security_events (RN-SEG-06/07 — eventos críticos de segurança)
--   - lgpd_exports (RN-LGP-04 — export FHIR/JSON com dual approval)
--
-- Particionamento futuro:
--   - Partições mensais 2026-08 a 2026-12 (auditoria_eventos, evolucoes,
--     prescricoes, sinais_vitais, acessos_prontuario, dispensacoes)
--
-- Índices de performance (queries top observadas nas Fases 1-12):
--   - auditoria por usuário/data
--   - glosas vencendo
--   - repasses por competência/status
--
-- Permissions: auditoria, lgpd, admin
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_security_event_tipo AS ENUM (
  'TENANT_VIOLATION',         -- RN-SEG-06: tentativa de acesso a tenant diferente do JWT
  'PERFIL_ALTERADO',          -- RN-SEG-07: mudança de papel/perfil
  'BLOQUEIO_TEMPORARIO',      -- RN-SEG-03: 5 tentativas falhas em 15min
  'BLOQUEIO_DEFINITIVO',      -- RN-SEG-03: 20 tentativas no mesmo IP em 1h
  'CERTIFICADO_INVALIDO',     -- RN-SEG-08: certificado ICP-Brasil inválido
  'EXPORT_MASSA_TENTATIVA',   -- RN-LGP-04: tentativa de export sem dual approval
  'TOKEN_REUSO_DETECTADO',    -- RN-SEG-04: refresh token rotativo reutilizado
  'OUTROS'
);

CREATE TYPE enum_security_event_severidade AS ENUM (
  'INFO',
  'WARNING',
  'ALERTA',
  'CRITICO'
);

CREATE TYPE enum_lgpd_export_status AS ENUM (
  'AGUARDANDO_APROVACAO_DPO',
  'AGUARDANDO_APROVACAO_SUPERVISOR',
  'APROVADO',
  'GERANDO',
  'PRONTO_PARA_DOWNLOAD',
  'BAIXADO',
  'EXPIRADO',
  'REJEITADO'
);

CREATE TYPE enum_lgpd_export_formato AS ENUM (
  'FHIR_JSON',
  'JSON_RAW'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. audit_security_events — RN-SEG-06/07
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE audit_security_events (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT,                                       -- pode ser NULL se for cross-tenant
  tipo            enum_security_event_tipo NOT NULL,
  severidade      enum_security_event_severidade NOT NULL DEFAULT 'WARNING',
  usuario_id      BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  alvo_usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL, -- ex.: admin alterando perfil de outro user
  ip_origem       INET,
  user_agent      VARCHAR(500),
  request_path    VARCHAR(300),
  request_method  VARCHAR(10),
  detalhes        JSONB NOT NULL,                               -- payload livre (rate counters, claim mismatch, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_audit_security_uuid ON audit_security_events (uuid_externo);
CREATE INDEX ix_audit_sec_tenant_data    ON audit_security_events (tenant_id, created_at DESC);
CREATE INDEX ix_audit_sec_tipo           ON audit_security_events (tipo, created_at DESC);
CREATE INDEX ix_audit_sec_severidade     ON audit_security_events (severidade, created_at DESC) WHERE severidade IN ('ALERTA','CRITICO');
CREATE INDEX ix_audit_sec_usuario        ON audit_security_events (usuario_id, created_at DESC) WHERE usuario_id IS NOT NULL;
CREATE INDEX ix_audit_sec_ip             ON audit_security_events (ip_origem, created_at DESC) WHERE ip_origem IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. lgpd_exports — RN-LGP-04 dual approval
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE lgpd_exports (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  paciente_id         BIGINT REFERENCES pacientes(id) ON DELETE RESTRICT, -- NULL se export em massa
  solicitacao_lgpd_id BIGINT,                                              -- FK lógica em solicitacoes_lgpd
  formato             enum_lgpd_export_formato NOT NULL DEFAULT 'FHIR_JSON',
  status              enum_lgpd_export_status NOT NULL DEFAULT 'AGUARDANDO_APROVACAO_DPO',
  -- Aprovação dupla (RN-LGP-04):
  solicitado_por      BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_solicitacao    TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo_solicitacao  TEXT NOT NULL,
  aprovado_dpo_por    BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_aprovacao_dpo  TIMESTAMPTZ,
  aprovado_supervisor_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_aprovacao_sup  TIMESTAMPTZ,
  rejeitado_por       BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  data_rejeicao       TIMESTAMPTZ,
  motivo_rejeicao     VARCHAR(500),
  -- Geração:
  data_geracao        TIMESTAMPTZ,
  arquivo_url         VARCHAR(500),                                       -- S3 / MinIO
  arquivo_hash_sha256 VARCHAR(64),
  data_expiracao      TIMESTAMPTZ,                                        -- 7 dias após pronto
  data_download       TIMESTAMPTZ,
  ip_download         INET,
  -- Audit:
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  CONSTRAINT ck_lgpd_export_aprovacao_dpo CHECK (
    (data_aprovacao_dpo IS NULL AND aprovado_dpo_por IS NULL)
    OR (data_aprovacao_dpo IS NOT NULL AND aprovado_dpo_por IS NOT NULL)
  ),
  CONSTRAINT ck_lgpd_export_aprovacao_sup CHECK (
    (data_aprovacao_sup IS NULL AND aprovado_supervisor_por IS NULL)
    OR (data_aprovacao_sup IS NOT NULL AND aprovado_supervisor_por IS NOT NULL)
  ),
  CONSTRAINT ck_lgpd_export_aprovadores_distintos CHECK (
    aprovado_dpo_por IS NULL
    OR aprovado_supervisor_por IS NULL
    OR aprovado_dpo_por <> aprovado_supervisor_por
  )
);

CREATE UNIQUE INDEX uq_lgpd_exports_uuid ON lgpd_exports (uuid_externo);
CREATE INDEX ix_lgpd_exports_status     ON lgpd_exports (tenant_id, status, data_solicitacao DESC);
CREATE INDEX ix_lgpd_exports_paciente   ON lgpd_exports (paciente_id) WHERE paciente_id IS NOT NULL;
CREATE INDEX ix_lgpd_exports_expirando  ON lgpd_exports (data_expiracao)
  WHERE status = 'PRONTO_PARA_DOWNLOAD' AND data_expiracao IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. tg_audit + RLS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON audit_security_events
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON lgpd_exports
  FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

ALTER TABLE audit_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_security_events FORCE ROW LEVEL SECURITY;
ALTER TABLE lgpd_exports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_exports          FORCE ROW LEVEL SECURITY;

-- audit_security_events: tenant_id pode ser NULL (cross-tenant) — política permite ver os do tenant atual + os globais
CREATE POLICY tenant_isolation ON audit_security_events
  USING (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT
  );

CREATE POLICY tenant_isolation ON lgpd_exports
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Particionamento futuro (2026-08 a 2026-12)
--    Cobre auditoria_eventos, acessos_prontuario, evolucoes, prescricoes,
--    sinais_vitais, dispensacoes — apenas as partições que ainda não existem.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_07
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_08
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_09
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_10
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_11
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS auditoria_eventos_2026_12
  PARTITION OF auditoria_eventos FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_07
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_08
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_09
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_10
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_11
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS acessos_prontuario_2026_12
  PARTITION OF acessos_prontuario FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS evolucoes_2026_08
  PARTITION OF evolucoes FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS evolucoes_2026_09
  PARTITION OF evolucoes FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS evolucoes_2026_10
  PARTITION OF evolucoes FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS evolucoes_2026_11
  PARTITION OF evolucoes FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS evolucoes_2026_12
  PARTITION OF evolucoes FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS prescricoes_2026_08
  PARTITION OF prescricoes FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS prescricoes_2026_09
  PARTITION OF prescricoes FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS prescricoes_2026_10
  PARTITION OF prescricoes FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS prescricoes_2026_11
  PARTITION OF prescricoes FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS prescricoes_2026_12
  PARTITION OF prescricoes FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS sinais_vitais_2026_08
  PARTITION OF sinais_vitais FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS sinais_vitais_2026_09
  PARTITION OF sinais_vitais FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS sinais_vitais_2026_10
  PARTITION OF sinais_vitais FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS sinais_vitais_2026_11
  PARTITION OF sinais_vitais FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS sinais_vitais_2026_12
  PARTITION OF sinais_vitais FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS dispensacoes_2026_09
  PARTITION OF dispensacoes FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS dispensacoes_2026_10
  PARTITION OF dispensacoes FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS dispensacoes_2026_11
  PARTITION OF dispensacoes FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS dispensacoes_2026_12
  PARTITION OF dispensacoes FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Índices de performance (queries top observadas)
-- ═══════════════════════════════════════════════════════════════════════

-- Auditoria: filtro frequente por tabela + finalidade + janela de tempo
CREATE INDEX IF NOT EXISTS ix_auditoria_tabela_finalidade ON auditoria_eventos
  (tabela, finalidade, created_at DESC);

-- Atendimentos: busca por cid_principal (epidemiologia)
CREATE INDEX IF NOT EXISTS ix_atendimentos_cid ON atendimentos (cid_principal)
  WHERE cid_principal IS NOT NULL AND deleted_at IS NULL;

-- Glosas: prazo + status (D-7/D-3/D-0)
CREATE INDEX IF NOT EXISTS ix_glosas_prazo_status ON glosas (prazo_recurso, status)
  WHERE status IN ('RECEBIDA','EM_ANALISE','EM_RECURSO');

-- Repasses: lookup competência+status para folha
CREATE INDEX IF NOT EXISTS ix_repasses_comp_status ON repasses (competencia, status, valor_liquido DESC);

-- Pacientes: busca por documento (CPF hash, CNS)
CREATE INDEX IF NOT EXISTS ix_pacientes_cpf_hash ON pacientes (cpf_hash) WHERE deleted_at IS NULL;

-- Webhooks: queue inbox por status
CREATE INDEX IF NOT EXISTS ix_webhooks_inbox_pending ON webhooks_inbox (status, data_recebimento ASC)
  WHERE status IN ('RECEBIDO','PROCESSANDO','ERRO');

-- Notificações pacientes: pendentes para reenvio
CREATE INDEX IF NOT EXISTS ix_notif_paciente_canal_status
  ON notificacoes_paciente (canal, status, created_at ASC)
  WHERE status IN ('PENDENTE','FALHA');

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  -- Auditoria (consulta)
  ('auditoria',  'read',          'Consultar auditoria_eventos com filtros'),
  ('auditoria',  'acessos',       'Consultar acessos_prontuario'),
  ('auditoria',  'security',      'Consultar audit_security_events'),
  -- LGPD
  ('lgpd',       'solicitar',     'Paciente solicita seus dados / correção / exclusão / portabilidade'),
  ('lgpd',       'aprovar_dpo',   'DPO aprova export em massa (RN-LGP-04 — 1ª aprovação)'),
  ('lgpd',       'aprovar_sup',   'Supervisor aprova export em massa (RN-LGP-04 — 2ª aprovação)'),
  ('lgpd',       'rejeitar',      'Rejeitar solicitação LGPD com motivo'),
  ('lgpd',       'gerar_export',  'Disparar geração do FHIR/JSON após aprovação dupla'),
  ('lgpd',       'baixar',        'Download do export pronto'),
  ('lgpd',       'admin',         'Admin LGPD (listar todas solicitações + exports)'),
  -- Admin global (cross-tenant)
  ('admin',      'tenants_read',  'Listar tenants (apenas ADMIN_GLOBAL)'),
  ('admin',      'tenants_write', 'Criar/editar tenants (apenas ADMIN_GLOBAL)'),
  ('admin',      'security_view', 'Ver eventos de segurança cross-tenant')
ON CONFLICT (recurso, acao) DO NOTHING;

DO $$
DECLARE current_t BIGINT;
BEGIN
  FOR current_t IN SELECT id FROM tenants WHERE ativo LOOP
    PERFORM set_config('app.current_tenant_id', current_t::text, TRUE);

    -- ADMIN tudo (exceto admin global cross-tenant)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='ADMIN' AND p.tenant_id = current_t
       AND ((perm.recurso='auditoria' AND perm.acao IN ('read','acessos','security'))
         OR (perm.recurso='lgpd' AND perm.acao IN ('aprovar_dpo','aprovar_sup','rejeitar','gerar_export','baixar','admin')))
    ON CONFLICT DO NOTHING;

    -- AUDITOR (perfil pré-existente?) — ler auditoria
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='AUDITOR' AND p.tenant_id = current_t
       AND (perm.recurso='auditoria' AND perm.acao IN ('read','acessos','security'))
    ON CONFLICT DO NOTHING;

    -- PACIENTE_PORTAL: solicitar (LGPD)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='PACIENTE_PORTAL' AND p.tenant_id = current_t
       AND (perm.recurso='lgpd' AND perm.acao IN ('solicitar','baixar'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;

-- ADMIN_GLOBAL: cross-tenant — esse perfil é especial, fora do loop por tenant
DO $$
DECLARE
  v_perfil_id BIGINT;
BEGIN
  -- Cria/recupera perfil ADMIN_GLOBAL no tenant id=1 (convenção: tenant raiz/padrão)
  PERFORM set_config('app.current_tenant_id', '1', TRUE);
  INSERT INTO perfis (tenant_id, codigo, nome, descricao, ativo)
  VALUES (1, 'ADMIN_GLOBAL', 'Admin Global', 'Cross-tenant — apenas operações de plataforma', TRUE)
  ON CONFLICT (tenant_id, codigo) DO NOTHING
  RETURNING id INTO v_perfil_id;

  -- Pega o id se já existir
  IF v_perfil_id IS NULL THEN
    SELECT id INTO v_perfil_id FROM perfis WHERE tenant_id=1 AND codigo='ADMIN_GLOBAL';
  END IF;

  IF v_perfil_id IS NOT NULL THEN
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT v_perfil_id, perm.id FROM permissoes perm
     WHERE perm.recurso='admin' AND perm.acao IN ('tenants_read','tenants_write','security_view')
    ON CONFLICT DO NOTHING;
  END IF;
END$$;
