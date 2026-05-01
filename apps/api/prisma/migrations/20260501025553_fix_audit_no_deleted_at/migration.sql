-- Fase 6 / fix — fn_audit_changes referenciava NEW.deleted_at direto.
-- plpgsql resolve o nome no PARSE, então mesmo dentro de IF que checa
-- existência, falha em UPDATE de tabelas sem deleted_at (ex.:
-- solicitacoes_exame, prescricoes_itens, procedimento_principio_ativo,
-- interacoes_medicamentosas, equipamentos_em_alguns_estados).
--
-- Fix: usar to_jsonb(NEW) ->> 'deleted_at' em vez de NEW.deleted_at,
-- mantendo semântica de soft-delete detection.

CREATE OR REPLACE FUNCTION fn_audit_changes() RETURNS TRIGGER AS $$
DECLARE
  v_diff JSONB;
  v_op   CHAR(1);
  v_tenant_id BIGINT;
  v_new_jsonb JSONB;
  v_old_jsonb JSONB;
  v_new_deleted_at TEXT;
  v_old_deleted_at TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op   := 'I';
    v_diff := jsonb_build_object('antes', NULL, 'depois', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_new_jsonb := to_jsonb(NEW);
    v_old_jsonb := to_jsonb(OLD);
    v_new_deleted_at := v_new_jsonb ->> 'deleted_at';
    v_old_deleted_at := v_old_jsonb ->> 'deleted_at';
    -- Soft-delete = transição de NULL para NOT NULL em deleted_at (se a
    -- tabela tiver a coluna; caso contrário ambos NULL e cai no else).
    IF v_new_deleted_at IS NOT NULL AND v_old_deleted_at IS NULL THEN
      v_op := 'S';
    ELSE
      v_op := 'U';
    END IF;
    v_diff := jsonb_build_object('antes', v_old_jsonb, 'depois', v_new_jsonb);
  ELSIF TG_OP = 'DELETE' THEN
    v_op   := 'D';
    v_diff := jsonb_build_object('antes', to_jsonb(OLD), 'depois', NULL);
  END IF;

  v_tenant_id := NULL;
  IF (to_jsonb(COALESCE(NEW, OLD)) ? 'tenant_id') THEN
    v_tenant_id := (to_jsonb(COALESCE(NEW, OLD)) ->> 'tenant_id')::BIGINT;
  END IF;

  INSERT INTO auditoria_eventos (
    tenant_id, tabela, registro_id, operacao, diff,
    usuario_id, correlation_id
  ) VALUES (
    v_tenant_id,
    TG_TABLE_NAME,
    (to_jsonb(COALESCE(NEW, OLD)) ->> 'id')::BIGINT,
    v_op,
    v_diff,
    NULLIF(current_setting('app.current_user_id', TRUE), '')::BIGINT,
    NULLIF(current_setting('app.current_correlation_id', TRUE), '')::UUID
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
