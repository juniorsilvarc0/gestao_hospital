-- ============================================================================
-- Fase 11 — Portais (Médico, Paciente) + Webhooks + LGPD consentimentos
--
-- Tabelas novas:
--   - webhooks_inbox (idempotência por idempotency_key)
--   - consentimentos_lgpd (termos aceitos pelo paciente)
--   - notificacoes_paciente (histórico push/SMS/email)
--
-- ALTERs:
--   - usuarios: paciente_id (FK para portal-paciente) + tipo_perfil
--
-- Invariantes:
--   #1 Webhook é idempotente por (origem, idempotency_key)
--   #2 Consentimento LGPD é imutável após aceito (apenas revoga marcando data_revogacao)
--   #3 Usuário do tipo PACIENTE deve ter paciente_id; do tipo PRESTADOR deve ter prestador_id
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ENUMs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TYPE enum_usuario_tipo_perfil AS ENUM (
  'INTERNO',          -- funcionário do hospital
  'PRESTADOR',        -- médico/profissional vinculado
  'PACIENTE'          -- portal-paciente
);

CREATE TYPE enum_webhook_origem AS ENUM (
  'TISS_RETORNO',
  'LAB_APOIO',
  'FINANCEIRO',
  'GATEWAY_PAGAMENTO',
  'OUTROS'
);

CREATE TYPE enum_webhook_status AS ENUM (
  'RECEBIDO',
  'PROCESSANDO',
  'PROCESSADO',
  'ERRO',
  'IGNORADO'
);

CREATE TYPE enum_consentimento_finalidade AS ENUM (
  'TERMO_USO_PORTAL',
  'COMPARTILHAMENTO_DADOS_CONVENIO',
  'TELECONSULTA_GRAVACAO',
  'PESQUISA_CIENTIFICA',
  'COMUNICACAO_MARKETING',
  'OUTROS'
);

CREATE TYPE enum_notificacao_canal AS ENUM (
  'EMAIL',
  'SMS',
  'PUSH',
  'WHATSAPP'
);

CREATE TYPE enum_notificacao_status AS ENUM (
  'PENDENTE',
  'ENVIADA',
  'ENTREGUE',
  'LIDA',
  'FALHA'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ALTER usuarios — paciente_id + tipo_perfil
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE usuarios
  ADD COLUMN paciente_id  BIGINT REFERENCES pacientes(id) ON DELETE RESTRICT,
  ADD COLUMN tipo_perfil  enum_usuario_tipo_perfil NOT NULL DEFAULT 'INTERNO';

CREATE INDEX ix_usuarios_paciente ON usuarios (paciente_id) WHERE paciente_id IS NOT NULL;
CREATE INDEX ix_usuarios_tipo     ON usuarios (tenant_id, tipo_perfil) WHERE deleted_at IS NULL;

-- Invariante #3: PACIENTE → paciente_id, PRESTADOR → prestador_id
-- (CHECK constraint para validar coerência)
ALTER TABLE usuarios
  ADD CONSTRAINT ck_usuarios_tipo_vinculo CHECK (
    (tipo_perfil = 'PACIENTE'  AND paciente_id  IS NOT NULL AND prestador_id IS NULL)
    OR (tipo_perfil = 'PRESTADOR' AND prestador_id IS NOT NULL AND paciente_id  IS NULL)
    OR (tipo_perfil = 'INTERNO'   AND paciente_id  IS NULL)
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 3. webhooks_inbox — idempotência
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE webhooks_inbox (
  id                  BIGSERIAL PRIMARY KEY,
  uuid_externo        UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id           BIGINT NOT NULL,
  origem              enum_webhook_origem NOT NULL,
  idempotency_key     VARCHAR(120) NOT NULL,                    -- request-id, event-id da origem
  endpoint            VARCHAR(200) NOT NULL,                    -- /v1/webhooks/tiss/retorno etc.
  payload             JSONB NOT NULL,                           -- corpo bruto recebido
  headers             JSONB,                                    -- headers relevantes
  signature           VARCHAR(500),                             -- HMAC ou similar (validação)
  status              enum_webhook_status NOT NULL DEFAULT 'RECEBIDO',
  data_recebimento    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_processamento  TIMESTAMPTZ,
  tentativas          INTEGER NOT NULL DEFAULT 0,
  erro_mensagem       TEXT,
  erro_stack          TEXT,
  resultado           JSONB,                                    -- payload de resposta processada
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook_idem UNIQUE (tenant_id, origem, idempotency_key)
);

CREATE UNIQUE INDEX uq_webhooks_inbox_uuid ON webhooks_inbox (uuid_externo);
CREATE INDEX ix_webhooks_status      ON webhooks_inbox (status, data_recebimento DESC) WHERE status IN ('RECEBIDO','PROCESSANDO','ERRO');
CREATE INDEX ix_webhooks_origem_data ON webhooks_inbox (origem, data_recebimento DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. consentimentos_lgpd
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE consentimentos_lgpd (
  id                BIGSERIAL PRIMARY KEY,
  uuid_externo      UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id         BIGINT NOT NULL,
  paciente_id       BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  finalidade        enum_consentimento_finalidade NOT NULL,
  texto_apresentado TEXT NOT NULL,                              -- versão do termo no momento
  versao_termo      VARCHAR(20) NOT NULL,                       -- ex: "v1.2.0"
  aceito            BOOLEAN NOT NULL,
  data_decisao      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_origem         INET,
  user_agent        VARCHAR(500),
  data_revogacao    TIMESTAMPTZ,
  motivo_revogacao  VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        BIGINT,
  CONSTRAINT uq_consent_paciente_finalidade UNIQUE (tenant_id, paciente_id, finalidade, versao_termo)
);

CREATE UNIQUE INDEX uq_consentimentos_uuid ON consentimentos_lgpd (uuid_externo);
CREATE INDEX ix_consent_paciente ON consentimentos_lgpd (paciente_id, finalidade);
CREATE INDEX ix_consent_ativo    ON consentimentos_lgpd (paciente_id, finalidade) WHERE data_revogacao IS NULL AND aceito = TRUE;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. notificacoes_paciente
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE notificacoes_paciente (
  id              BIGSERIAL PRIMARY KEY,
  uuid_externo    UUID NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id       BIGINT NOT NULL,
  paciente_id     BIGINT NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
  canal           enum_notificacao_canal NOT NULL,
  destinatario    VARCHAR(200) NOT NULL,                        -- email/telefone/device-id
  assunto         VARCHAR(200),
  conteudo        TEXT NOT NULL,
  payload_extra   JSONB,                                         -- params do template
  template_codigo VARCHAR(80),                                   -- ex: "agendamento.confirmacao"
  status          enum_notificacao_status NOT NULL DEFAULT 'PENDENTE',
  data_envio      TIMESTAMPTZ,
  data_entrega    TIMESTAMPTZ,
  data_leitura    TIMESTAMPTZ,
  erro_mensagem   VARCHAR(500),
  tentativas      INTEGER NOT NULL DEFAULT 0,
  provider_id     VARCHAR(120),                                 -- ID do provedor (Twilio, SES, etc.)
  origem_evento   VARCHAR(80),                                  -- ex: "agendamento.confirmacao", "exame.resultado_disponivel"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT
);

CREATE UNIQUE INDEX uq_notificacoes_paciente_uuid ON notificacoes_paciente (uuid_externo);
CREATE INDEX ix_notif_paciente ON notificacoes_paciente (paciente_id, created_at DESC);
CREATE INDEX ix_notif_status   ON notificacoes_paciente (status, created_at DESC) WHERE status IN ('PENDENTE','FALHA');

-- ═══════════════════════════════════════════════════════════════════════
-- 6. tg_audit em todas
-- ═══════════════════════════════════════════════════════════════════════
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON webhooks_inbox        FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON consentimentos_lgpd   FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();
CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON notificacoes_paciente FOR EACH ROW EXECUTE FUNCTION fn_audit_changes();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE webhooks_inbox        ENABLE ROW LEVEL SECURITY;  ALTER TABLE webhooks_inbox        FORCE ROW LEVEL SECURITY;
ALTER TABLE consentimentos_lgpd   ENABLE ROW LEVEL SECURITY;  ALTER TABLE consentimentos_lgpd   FORCE ROW LEVEL SECURITY;
ALTER TABLE notificacoes_paciente ENABLE ROW LEVEL SECURITY;  ALTER TABLE notificacoes_paciente FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON webhooks_inbox        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON consentimentos_lgpd   USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);
CREATE POLICY tenant_isolation ON notificacoes_paciente USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::BIGINT);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Permissões
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('portal_medico',    'read',         'Acessar portal do médico'),
  ('portal_medico',    'agenda',       'Ver agenda do médico logado'),
  ('portal_medico',    'laudos',       'Ver laudos pendentes do médico'),
  ('portal_medico',    'producao',     'Ver produção/repasse próprio'),
  ('portal_paciente',  'read',         'Acessar portal do paciente'),
  ('portal_paciente',  'agendar',      'Auto-agendar consulta/exame'),
  ('portal_paciente',  'exames',       'Ver resultados de exames'),
  ('portal_paciente',  'receitas',     'Ver receitas emitidas'),
  ('portal_paciente',  'teleconsulta', 'Acessar link de teleconsulta'),
  ('portal_paciente',  'contas',       'Ver histórico financeiro'),
  ('webhooks',         'receber_tiss', 'Receber webhook TISS'),
  ('webhooks',         'receber_lab',  'Receber webhook lab apoio'),
  ('webhooks',         'receber_fin',  'Receber webhook financeiro'),
  ('webhooks',         'admin',        'Admin de webhooks (reprocessar)'),
  ('lgpd_consent',     'aceitar',      'Registrar aceite/recusa de termo'),
  ('lgpd_consent',     'revogar',      'Revogar consentimento'),
  ('lgpd_consent',     'read',         'Listar consentimentos próprios'),
  ('notificacoes',     'read',         'Ler notificações próprias'),
  ('notificacoes',     'admin',        'Admin (reenviar, marcar como lida)')
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
       AND perm.recurso IN ('portal_medico','portal_paciente','webhooks','lgpd_consent','notificacoes')
    ON CONFLICT DO NOTHING;

    -- MEDICO: portal médico (read + agenda + laudos + produção próprios)
    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='MEDICO'
       AND ((perm.recurso='portal_medico' AND perm.acao IN ('read','agenda','laudos','producao'))
         OR (perm.recurso='notificacoes' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;

    -- Garante perfil PACIENTE_PORTAL (cria se não existir) e suas permissões
    INSERT INTO perfis (tenant_id, codigo, nome, descricao, ativo)
    VALUES (current_t, 'PACIENTE_PORTAL', 'Paciente (Portal)', 'Acesso restrito do paciente ao portal', TRUE)
    ON CONFLICT (tenant_id, codigo) DO NOTHING;

    INSERT INTO perfis_permissoes (perfil_id, permissao_id)
    SELECT p.id, perm.id FROM perfis p CROSS JOIN permissoes perm
     WHERE p.codigo='PACIENTE_PORTAL' AND p.tenant_id = current_t
       AND ((perm.recurso='portal_paciente' AND perm.acao IN ('read','agendar','exames','receitas','teleconsulta','contas'))
         OR (perm.recurso='lgpd_consent' AND perm.acao IN ('aceitar','revogar','read'))
         OR (perm.recurso='notificacoes' AND perm.acao='read'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END$$;
