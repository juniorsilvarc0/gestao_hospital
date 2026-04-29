-- Fase 2 / fix — Drop tg_audit em sessoes_ativas.
--
-- A tabela `sessoes_ativas` tem PK UUID (`id String @id @db.Uuid`), mas a
-- função `fn_audit_changes()` da migration `audit_rls` faz
-- `(to_jsonb(NEW) ->> 'id')::BIGINT` — falha com 22P02 (invalid bigint)
-- em qualquer INSERT/UPDATE/DELETE de sessões.
--
-- Decisão: remover o trigger em sessoes_ativas. A auditoria de eventos de
-- sessão (login OK/falha, refresh rotation, logout, lockout) é feita via
-- AuditoriaService.record() em app-level, com semântica mais rica
-- (tabela='auth.login', registro_id=usuario_id, etc). Triggers em tabelas
-- de PK não-BIGINT entrarão em fix futuro generalizado (DB.md §6.3).

DROP TRIGGER IF EXISTS tg_audit ON sessoes_ativas;
