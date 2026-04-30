-- ─────────────────────────────────────────────────────────────────────
-- Fase 3 / Trilha A — Pacientes (complementar)
--
-- 1. Adiciona `uuid_externo` em `pacientes_convenios` para que a API
--    exponha vínculos por UUID (docs/05 §1.2 — nunca BIGINT externo).
--    DELETE /v1/pacientes/{uuid}/convenios/{vinculo_uuid} depende disso.
--
-- 2. Cataloga as permissões `pacientes:delete`, `lgpd:export` e
--    `lgpd:request` (catálogo global, sem RLS) e vincula ao perfil
--    ADMIN em todos os tenants existentes (idempotente).
--
-- A tabela `solicitacoes_lgpd` já foi criada por uma migração anterior
-- (`20260429120000_solicitacoes_lgpd` — registro presente em
-- `_prisma_migrations`). Este arquivo apenas completa as peças que
-- faltavam para a Trilha A.
-- ─────────────────────────────────────────────────────────────────────

-- 1. uuid_externo em pacientes_convenios.
ALTER TABLE pacientes_convenios
  ADD COLUMN IF NOT EXISTS uuid_externo UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS uq_pac_conv_uuid
  ON pacientes_convenios (uuid_externo);

-- 2. Permissões novas + vínculo com ADMIN.
INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('pacientes', 'delete',  'Soft-delete de paciente (admin)'),
  ('lgpd',      'export',  'Exportar dados pessoais do paciente (LGPD Art.18)'),
  ('lgpd',      'request', 'Registrar solicitação LGPD (acesso/exclusão/etc.)')
ON CONFLICT (recurso, acao) DO NOTHING;

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id
  FROM perfis p
  CROSS JOIN permissoes perm
 WHERE p.codigo = 'ADMIN'
   AND (perm.recurso, perm.acao) IN (
        ('pacientes', 'delete'),
        ('lgpd',      'export'),
        ('lgpd',      'request')
   )
ON CONFLICT (perfil_id, permissao_id) DO NOTHING;
