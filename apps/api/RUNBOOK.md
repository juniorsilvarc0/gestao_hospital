# RUNBOOK Operacional — HMS-BR

> **Sistema de Gestão Hospitalar (HMS-BR)** — Fase 13 (Hardening + Go-Live).
> Documento de operação destinado a SRE/DevOps, DBAs, suporte clínico e DPO.
>
> Linguagem: pt-BR técnico. Comandos em blocos `bash` / `sql`.
> Atualizado: 2026-05-04.

---

## 1. Visão geral da arquitetura

```
                  ┌────────────┐
                  │  Operador  │
                  └─────┬──────┘
                        │ HTTPS
                        ▼
              ┌────────────────────┐
              │   Frontend (Web)   │ React 18 + Vite (porta 5173)
              └─────────┬──────────┘
                        │ /v1/*
                        ▼
              ┌────────────────────┐
              │  API NestJS        │ Node 20 (porta 3000)
              │  + WebSocket       │ Socket.IO
              └─┬─────────────┬────┘
       ┌────────┘             │
       ▼                      ▼
┌────────────┐    ┌──────────────────┐
│ Postgres 16│    │ Redis 7 (cache + │
│ (porta     │    │ BullMQ + Streams)│
│  5432)     │    │ (porta 6379)     │
└─────┬──────┘    └─────┬────────────┘
      │                 │
      ▼                 ▼
┌────────────┐    ┌──────────────────┐
│  Replica   │    │ MinIO (S3-like)  │
│  read-only │    │ (porta 9000)     │
└────────────┘    └──────────────────┘
                        ▲
                        │
              ┌─────────┴────────┐
              │ AI service       │ FastAPI (porta 8000)
              │ (OCR / NLP)      │ Python 3.12
              └──────────────────┘
```

### Componentes e portas (Docker)

| Serviço          | Imagem                    | Porta host | Porta container | Função                                |
|------------------|---------------------------|-----------:|----------------:|----------------------------------------|
| `web`            | node:20-alpine            | 5173       | 5173            | Frontend Vite                         |
| `api`            | node:20-alpine            | 3000       | 3000            | API NestJS principal                  |
| `db`             | postgres:16               | 5432       | 5432            | Banco operacional                     |
| `db-replica`     | postgres:16               | 5433       | 5432            | Réplica streaming (read-only)         |
| `redis`          | redis:7                   | 6379       | 6379            | Cache + BullMQ + Streams              |
| `minio`          | minio/minio               | 9000/9001  | 9000/9001       | Armazenamento de arquivos             |
| `ai-service`     | python:3.12-slim          | 8000       | 8000            | OCR + NLP isolado                     |
| `prometheus`     | prom/prometheus           | 9090       | 9090            | Métricas                              |
| `grafana`        | grafana/grafana           | 3001       | 3000            | Dashboards observabilidade            |

### Dependências (graph de start-up)

```
db, redis, minio  →  api, ai-service  →  web
                  →  prometheus, grafana (independentes)
```

A API só inicia depois que `db.ready` e `redis.ready` retornam OK no `/health`. Em DR, levantar nessa ordem.

---

## 2. Variáveis de ambiente

> Mantidas em **AWS Secrets Manager** (prod) e `.env` local (dev). NUNCA commitar valores reais.

### API (`apps/api/.env`)

| Var                            | Descrição                                                       | Rotação | Impacto da rotação                            |
|--------------------------------|-----------------------------------------------------------------|---------|-----------------------------------------------|
| `DATABASE_URL`                 | URL Postgres principal (com SSL).                              | Trimestral | Reinicia API; conexões em curso caem.       |
| `DATABASE_REPLICA_URL`         | URL réplica read-only.                                         | Trimestral | Apenas dashboards/BI ficam degradados.      |
| `REDIS_URL`                    | URL Redis 7.                                                   | Trimestral | Reinicia API; sessões em sessionStorage caem.|
| `BULL_REDIS_URL`               | URL Redis dedicado a filas (pode ser o mesmo).                 | Trimestral | Jobs pendentes drenam ou falham.             |
| `JWT_SECRET`                   | Chave HS256 do access token.                                   | **Mensal** | Todos os usuários precisam re-login.       |
| `JWT_REFRESH_SECRET`           | Chave HS256 do refresh token.                                  | Trimestral | Refresh tokens existentes invalidados.       |
| `MINIO_ENDPOINT`               | URL MinIO/S3.                                                  | Anual   | Reinicia API.                                 |
| `MINIO_ACCESS_KEY`             | Access key.                                                    | Trimestral | Reinicia API.                              |
| `MINIO_SECRET_KEY`             | Secret key.                                                    | Trimestral | Reinicia API.                              |
| `MINIO_BUCKET_PRONTUARIO`      | Bucket de arquivos clínicos.                                   | —       | Mudança requer migração.                      |
| `MINIO_BUCKET_LGPD_EXPORTS`    | Bucket dos pacotes FHIR exportados.                            | —       | Mudança requer migração.                      |
| `ICP_BRASIL_TRUSTSTORE_PATH`   | Caminho para truststore com ACs ICP-Brasil.                    | Anual   | Validação de assinaturas falha até atualizar. |
| `ICP_BRASIL_REVOCATION_TIMEOUT_MS` | Timeout de checagem CRL/OCSP.                              | —       | —                                             |
| `WEBHOOK_TISS_SECRET`          | Segredo HMAC dos webhooks TISS.                                | Trimestral | Operadora precisa atualizar config remota. |
| `WEBHOOK_LAB_SECRET`           | Segredo HMAC dos webhooks de lab apoio.                        | Trimestral | Lab precisa atualizar config remota.        |
| `WEBHOOK_FINANCEIRO_SECRET`    | Segredo HMAC dos webhooks financeiros (RM).                    | Trimestral | RM precisa atualizar config remota.         |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | Endpoint do collector.                                         | —       | Sem traces até reiniciar.                     |
| `LOG_LEVEL`                    | `info` (prod) / `debug` (staging).                             | —       | Imediato (hot reload).                        |
| `NODE_ENV`                     | `production`.                                                  | —       | —                                             |

### Frontend (`apps/web/.env`)

| Var               | Descrição                                       |
|-------------------|-------------------------------------------------|
| `VITE_API_URL`    | URL pública da API. Sem barra no final.         |
| `VITE_WS_URL`     | URL para Socket.IO.                             |
| `VITE_SENTRY_DSN` | DSN front-end (sem PHI).                        |

### Procedimento de rotação (resumo)

1. Gerar nova credencial em **Secrets Manager** com tag `pending`.
2. Aplicar via Helm (`helm upgrade`) com `valuesFrom: secretsManagerArn`.
3. Validar `/health` e amostra de fluxo crítico (login + listar pacientes).
4. Promover novo secret a `current`, desativar antigo após 24 h.
5. Registrar no log `OperacaoSecretsRotacao` (auditoria).

---

## 3. Health checks

| Endpoint              | Método | Resposta esperada                | Quem consome              |
|-----------------------|--------|-----------------------------------|---------------------------|
| `/health`             | GET    | `{ status: "ok" }` (200)         | Liveness probe (k8s)      |
| `/ready`              | GET    | `{ db, redis, minio }` (200)     | Readiness probe (k8s)     |
| `/metrics`            | GET    | Prometheus exposition            | `prometheus` job          |
| `/v1/bi/refresh/status` | GET  | Última execução das MVs          | Painel BI / SRE           |
| `/v1/admin/security/dashboard?dias=7` | GET | Resumo de eventos de segurança | DPO / SRE             |

### Check sintético (smoke test)

```bash
curl -fs https://api.hms.local/health | jq '.status'
# "ok"

curl -fs https://api.hms.local/ready | jq '.db, .redis, .minio'
# true / true / true
```

Falha em qualquer uma → alerta P2.

---

## 4. Backup

### Postgres (diário, 02:00 BRT)

```bash
# Dump lógico full
pg_dump --format=custom --jobs=4 --compress=9 \
  --file="/backups/hms-$(date +%F).dump" \
  "$DATABASE_URL"

# Snapshot WAL para PITR (cron 5 min)
pg_basebackup -D /backups/wal/$(date +%F-%H%M) -F tar -z -P
```

Retenção: **30 dias diários** + **12 mensais** + **5 anos para `auditoria_eventos`** (LGPD/CFM).

### MinIO (diário, 03:00 BRT)

```bash
mc mirror --overwrite --remove minio/prontuario s3://dr-bucket/prontuario/
mc mirror --overwrite --remove minio/lgpd-exports s3://dr-bucket/lgpd-exports/
```

Retenção: **1 ano**. Bucket DR replicado em **outra região AWS**.

### Validação semanal de backup

```bash
# Restore para sandbox e checar tabela auditoria_eventos
pg_restore --dbname=hms_sandbox /backups/hms-$(date -d 'yesterday' +%F).dump
psql hms_sandbox -c "SELECT count(*) FROM auditoria_eventos WHERE ocorrido_em > now() - interval '24 hours';"
```

Resultado esperado: `count > 0`. Caso contrário, alerta P1.

---

## 5. Restore PITR

> **RTO < 4 h · RPO < 15 min** (objetivo).

### Cenário: corrupção lógica em produção (ex.: DELETE acidental)

1. Confirmar momento exato (`SELECT max(ocorrido_em) FROM auditoria_eventos WHERE acao='DELETE'`).
2. Bloquear writes (gateway HTTP em modo read-only).
3. Restaurar base + WAL até `T - 1 minuto` do incidente.
   ```bash
   pg_basebackup -D /var/lib/postgresql/restore -F tar -z -P
   # restore_command em recovery.conf:
   #   restore_command = 'cp /backups/wal/%f %p'
   #   recovery_target_time = '2026-05-04 14:32:00'
   ```
4. Levantar instância de validação isolada.
5. Conferir contagem em tabelas críticas (`prescricoes`, `evolucoes`, `contas`).
6. Promover instância → primário.
7. Ressincronizar réplica.
8. Re-habilitar writes via gateway.
9. Comunicar usuários (banner) + abrir ticket interno.

### Cenário: perda total de cluster

1. Provisionar novo cluster em região DR via Terraform: `cd infra/terraform && terraform apply -var-file=dr.tfvars`.
2. Restaurar dump do dia + WAL incremental.
3. Reapontar DNS (`api.hms.local`) para o novo cluster (TTL 60 s).
4. Verificar `/ready` e fluxos críticos.
5. Notificar Encarregado/DPO se houver janela superior a 4 h (LGPD ANPD).

---

## 6. Disaster Recovery — 5 cenários

### 6.1 DB primary down

**Sintoma:** API retorna 503 em endpoints que tocam DB; alerta `pg_up{role=primary}=0`.

**Runbook:**
1. Confirmar via `psql -h primary -c 'SELECT 1'` — se timeout, considerar primário caído.
2. Promover réplica:
   ```bash
   ssh dba@db-replica
   pg_ctl promote -D /var/lib/postgresql/data
   ```
3. Atualizar `DATABASE_URL` para apontar para a antiga réplica (Secrets Manager).
4. `kubectl rollout restart deployment/api`.
5. Provisionar nova réplica do novo primário.
6. RTO esperado: **< 30 min**.

### 6.2 Redis down

**Sintoma:** sessions ainda funcionam (sessionStorage), mas WS/queue/cache caem.

**Impacto:**
- Mapa de leitos para de receber updates em tempo real (clientes conectados).
- Jobs BullMQ pausam (geração TISS, refresh BI agendado, dispensação assíncrona).
- Cache de tabelas TUSS expira (queries vão ao DB).

**Runbook:**
1. Confirmar via `redis-cli -u $REDIS_URL ping`.
2. Subir cluster Redis Sentinel reserva: `kubectl apply -f infra/k8s/redis-failover.yaml`.
3. Atualizar `REDIS_URL` e `BULL_REDIS_URL`.
4. Reprocessar jobs perdidos: `pnpm --filter api exec node scripts/reprocess-failed-jobs.js`.
5. RTO esperado: **< 15 min**.

**Fallback degradado:** API tem flag `DEGRADED_NO_REDIS=true` que desativa cache (queries diretas), suspende WS (HTTP polling) e bufferiza eventos em-memória (limit 1000).

### 6.3 MinIO down

**Sintoma:** uploads de PDF/laudo, downloads de export LGPD e visualização de imagens falham (5xx).

**Impacto:** PEP, laudos, exportações LGPD e webhooks que anexam arquivo.

**Runbook:**
1. Verificar `mc admin info minio`.
2. Failover para bucket DR: alterar `MINIO_ENDPOINT` para `https://s3.dr.hms.local`.
3. Verificar replicação está em dia: `mc replicate diff`.
4. RTO esperado: **< 1 h** (replicação MinIO assíncrona — RPO ~5 min).
5. Após retorno, ressincronizar primary com `mc mirror dr → primary`.

### 6.4 API container fail (crashloop)

**Sintoma:** k8s mostra `CrashLoopBackOff` em pelo menos um pod; latência sobe.

**Runbook:**
1. `kubectl logs -l app=api --tail=500 | grep -E '(FATAL|Error|panic)'`.
2. Se erro de migration: `pnpm --filter api exec prisma migrate status`.
3. Se erro de `JWT_SECRET` ausente: validar secret está montado.
4. Rollback rápido:
   ```bash
   helm rollback hms-api <revisao-anterior>
   ```
5. Para crash isolado em um pod: `kubectl delete pod <pod-name>` (HPA recria).
6. Se 100% dos pods em crash: rollback Helm + abrir ticket P1.

### 6.5 Tenant data leak (RN-LGP-05)

**Sintoma típico:** alerta "tenant_id mismatch" em `audit_security_events`, ou denúncia externa.

**Procedimento (executar em ordem, sem desvios):**

1. **Conter:**
   - Bloquear conexões da fonte: `iptables -A INPUT -s <ip> -j DROP` ou via WAF.
   - Revogar tokens do tenant afetado:
     ```sql
     UPDATE usuarios_tokens SET revogado_em = now()
     WHERE tenant_id = $TENANT_ID AND revogado_em IS NULL;
     ```
   - Em casos extremos, **desativar tenant**: `POST /v1/admin/tenants/:uuid/desativar`.

2. **Preservar evidências:**
   ```sql
   COPY (SELECT * FROM auditoria_eventos
         WHERE tenant_id = $TENANT_ID
           AND ocorrido_em > $T_INICIO_INCIDENTE)
     TO '/forensic/auditoria-$(date +%F).csv' CSV HEADER;
   COPY (SELECT * FROM audit_security_events
         WHERE tenant_id = $TENANT_ID
           AND ocorrido_em > $T_INICIO_INCIDENTE)
     TO '/forensic/security-$(date +%F).csv' CSV HEADER;
   ```
   Hash SHA-256 dos arquivos e armazenar em cofre.

3. **Notificar (timeline ANPD — 72 h máx.):**
   - Encarregado/DPO interno: imediato.
   - Diretoria: até 4 h.
   - **ANPD: até 72 h** via portal `https://www.gov.br/anpd/comunicacao-incidentes`.
   - Titulares afetados: conforme orientação do DPO.

4. **Investigar e corrigir:** análise de causa raiz, deploy de fix, verificação de RLS/tenant_id em queries afetadas.

5. **Pós-mortem e RCA:** documento público interno em até 7 dias úteis.

---

## 7. Monitoramento

### Dashboards Grafana (links)

| Dashboard                  | URL                                              | Refresh |
|----------------------------|--------------------------------------------------|---------|
| API — visão geral          | `https://grafana.hms.local/d/api-overview`      | 30 s    |
| Postgres                   | `https://grafana.hms.local/d/pg-detail`         | 30 s    |
| Redis + BullMQ             | `https://grafana.hms.local/d/redis-bull`        | 30 s    |
| WebSocket (mapa de leitos) | `https://grafana.hms.local/d/socketio`          | 30 s    |
| Latência por módulo        | `https://grafana.hms.local/d/api-latency`       | 60 s    |
| BI / Refresh MVs           | `https://grafana.hms.local/d/bi-refresh`        | 5 min   |
| Security (cross-tenant)    | `https://grafana.hms.local/d/security`          | 60 s    |

### Alertas críticos (Alertmanager)

| Nome                         | Condição                                                  | Severidade | Quem chama          |
|------------------------------|-----------------------------------------------------------|-----------:|---------------------|
| `ApiDown`                    | `up{job="api"} == 0` por 2 min                           | P1         | DevOps de plantão   |
| `ApiHighErrorRate`           | `rate(http_requests_total{status=~"5.."}[5m]) > 5%`      | P1         | DevOps              |
| `DbConnectionsExhausted`     | `pg_stat_activity_count > 90% pool`                      | P1         | DBA + DevOps        |
| `BiRefreshFailed`            | `bi_refresh_status{status="erro"} > 0` por 15 min        | P3         | Time BI             |
| `LgpdExportPendingTooLong`   | `lgpd_export_aguardando > 24h`                            | P3         | DPO                 |
| `WebSocketDisconnects`       | `ws_disconnects_per_min > 50`                             | P2         | DevOps              |
| `BruteForceSurge`            | `audit_security_events{tipo="BRUTEFORCE"} > 10/min`      | P1         | DPO + DevOps        |
| `TenantMismatch`             | `audit_security_events{tipo="TENANT_MISMATCH"} > 0`      | **P0**     | DPO + CTO + DevOps  |

### Escalation matrix

| Severidade | Tempo para resposta | Tempo para resolução | Quem assume        | Cliente      |
|-----------:|---------------------|----------------------|--------------------|--------------|
| **P0**     | 5 min               | 30 min               | CTO + DPO + DevOps | Notificação imediata |
| **P1**     | 15 min              | 4 h                  | DevOps de plantão  | Notif. em 1h |
| **P2**     | 1 h                 | 24 h                 | DevOps             | Status page  |
| **P3**     | 8 h                 | 7 dias               | Time correspondente | —           |

---

## 8. Operações comuns

### Adicionar novo tenant (hospital)

```bash
# Via API
curl -X POST https://api.hms.local/v1/admin/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"hsx","nome":"Hospital São Xavier","cnpj":"00.000.000/0001-00"}'
```

Em seguida:
1. Criar usuário ADMIN do tenant via UI Admin Global.
2. Carregar tabelas TUSS/CBHPM/CID via seed (`pnpm --filter api exec node scripts/seed-tabelas-saude.js --tenant=$UUID`).
3. Configurar parâmetros TISS por convênio.
4. Smoke test: criar paciente + atendimento + alta.

### Revogar refresh tokens de um usuário (incidente)

```sql
-- Marca tokens como revogados; user precisa relogar.
UPDATE usuarios_tokens
SET revogado_em = now(), revogado_por = $ADMIN_UUID, revogado_motivo = 'INCIDENTE'
WHERE usuario_uuid = $USER_UUID AND revogado_em IS NULL;
```

E registra evento de segurança:

```sql
INSERT INTO audit_security_events (tipo, severidade, usuario_uuid, detalhes, ocorrido_em)
VALUES ('TOKENS_REVOGADOS_ADMIN', 'ALERTA', $USER_UUID,
        '{"motivo":"INCIDENTE","admin":"$ADMIN_UUID"}'::jsonb, now());
```

### Forçar refresh BI

```bash
curl -X POST https://api.hms.local/v1/bi/refresh \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)"
```

UI equivalente: `/bi/refresh` → botão **Forçar refresh agora**.

### Reprocessar webhook em ERRO

```bash
# Via API:
curl -X POST https://api.hms.local/v1/webhooks/inbox/$WEBHOOK_UUID/reprocessar \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Antes, conferir o motivo do erro:
```sql
SELECT erro, payload->>'evento' AS evento
  FROM webhooks_inbox
 WHERE uuid = $WEBHOOK_UUID;
```

### Liberar lote CME após indicador biológico OK

```bash
curl -X POST https://api.hms.local/v1/cme/lotes/$LOTE_UUID/liberar \
  -H "Authorization: Bearer $FARMA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"indicadorBiologicoAprovado":true,"observacoes":"Spore test negativo"}'
```

---

## 9. Incidentes de segurança (RN-LGP-* / RN-SEG-*)

### RN-SEG-01 — Tentativa de brute-force

**Detecção:** > 5 LOGIN_FAIL no mesmo email/IP em 5 minutos.

**Resposta automática:** `BRUTEFORCE_BLOCK` no IP por 30 min (configurável). Evento em `audit_security_events`.

**Escalação manual:** se IP reincidente ≥ 3 bloqueios em 24 h, adicionar ao firewall permanente (WAF) e abrir ticket.

### RN-SEG-02 — MFA fail repetido

**Detecção:** > 3 MFA_FAIL no mesmo usuário em 15 min.

**Resposta:** bloqueio temporário da conta (15 min). Ao 5º bloqueio, exigir reset de MFA presencial.

### RN-SEG-03 — Acesso fora do horário

**Detecção:** acesso em recurso clínico fora da janela `06:00-22:00` BRT do tenant (configurável).

**Resposta:** evento WARNING + permite acesso. Visualização no dashboard de segurança.

### RN-LGP-05 — Vazamento de dados

Ver §6.5.

### Procedimento ANPD (notificação)

1. Reunir: data, escopo (campos vazados, qtd. titulares), causa raiz, medidas tomadas.
2. Enviar comunicado via portal ANPD em até **72 h** (LGPD art. 48).
3. Notificar titulares conforme art. 48 §1º.
4. Atualizar política interna se necessário.

---

## 10. Janelas de manutenção

> Janela padrão: **domingo 02:00–06:00 BRT**, banner avisa 7 dias antes.

### Pré-janela (D-7)

- Banner UI: "Sistema em manutenção em $(date +%d/%m %H:%M)".
- E-mail aos administradores de cada tenant.
- Confirmação com SRE de plantão.

### Atividades comuns na janela

#### Criar partições futuras (Prisma — fazer 3 meses à frente)

```sql
-- Para cada tabela particionada (evolucoes, prescricoes, dispensacoes, auditoria_eventos)
DO $$
DECLARE
  m DATE := date_trunc('month', now() + interval '3 months');
  next_m DATE := m + interval '1 month';
  part_name TEXT;
BEGIN
  FOR tbl IN ARRAY['evolucoes', 'prescricoes', 'dispensacoes', 'auditoria_eventos'] LOOP
    part_name := tbl || '_' || to_char(m, 'YYYYMM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      part_name, tbl, m, next_m
    );
  END LOOP;
END$$;
```

Verificação:
```sql
SELECT inhrelid::regclass FROM pg_inherits
WHERE inhparent = 'evolucoes'::regclass
ORDER BY inhrelid::regclass;
```

Esperado: pelo menos 3 partições à frente do mês corrente.

#### Refresh BI completo

```bash
curl -X POST https://api.hms.local/v1/bi/refresh \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### VACUUM e REINDEX nas grandes

```sql
VACUUM ANALYZE evolucoes;
VACUUM ANALYZE prescricoes;
VACUUM ANALYZE dispensacoes;
VACUUM ANALYZE auditoria_eventos;
REINDEX TABLE CONCURRENTLY pacientes;
REINDEX TABLE CONCURRENTLY contas;
```

#### EXPLAIN ANALYZE de queries do top 50

```sql
SELECT query, calls, mean_exec_time, total_exec_time
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 50;
```

Para cada query lenta:
```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <query>;
```

Procurar por `Seq Scan` em tabelas grandes ou estimativas de cardinalidade muito longe do real.

---

## 11. Performance — checklist

### a) Top 50 queries via `pg_stat_statements`

```sql
SELECT round(total_exec_time::numeric, 0) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(stddev_exec_time::numeric, 2) AS stddev_ms,
       left(query, 200) AS query
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 50;
```

### b) Índices a verificar (lista por módulo)

| Módulo            | Índice a manter                                                |
|-------------------|----------------------------------------------------------------|
| `pacientes`       | `ix_pacientes_tenant_cpf`, `ix_pacientes_tenant_nome_trgm`     |
| `atendimentos`    | `ix_atendimentos_tenant_aberto_em`, `ix_atendimentos_paciente` |
| `evolucoes`       | particionado por mês + `ix_evolucoes_atendimento`              |
| `prescricoes`     | particionado + `ix_prescricoes_status`                          |
| `dispensacoes`    | particionado + `ix_dispensacoes_paciente`                       |
| `contas`          | `ix_contas_status_competencia`, `ix_contas_convenio`           |
| `lotes_tiss`      | `ix_lotes_tiss_status`, `ix_lotes_tiss_versao`                 |
| `glosas`          | `ix_glosas_lote`, `ix_glosas_status`                            |
| `auditoria_eventos` | `ix_auditoria_tabela_registro`, `ix_auditoria_ocorrido_em`    |
| `audit_security_events` | `ix_security_severidade_ocorrido`                          |
| `repasse_apuracoes` | `ix_repasse_competencia_prestador`                            |

Verificar:
```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
  FROM pg_stat_user_indexes
 WHERE schemaname = 'public'
 ORDER BY idx_scan ASC
 LIMIT 30;
```

Índices com `idx_scan = 0` há > 30 dias são candidatos a remoção. **Não remover de tabelas particionadas sem auditoria conjunta.**

### c) Particionamento mensal

Garantir mínimo de **3 meses de partições à frente** do mês corrente. Falha provoca alerta P3.

### d) Cache hit rate Redis

```bash
redis-cli -u $REDIS_URL info stats | grep -E '(keyspace_hits|keyspace_misses)'
# hit rate ideal > 90% para tabelas TUSS/CBHPM
```

### e) WebSocket — conexões ativas

```bash
curl -fs https://api.hms.local/metrics | grep socketio_connected_total
# limite operacional: 5000 simultâneas por pod
```

---

## 12. Pilot e Go-Live — checklist por setor

> Cada setor entra em produção apenas após validação. Use como gate.

### Recepção (depende da Fase 5)

**Aceitação:**
- [ ] Operador cria paciente novo + carteirinha + check-in em < 2 min.
- [ ] Triagem Manchester registra cor + queixa principal.
- [ ] Painel de chamada exibe pacientes em < 5 s do check-in.
- [ ] Auditoria registra: `pacientes_criados`, `atendimentos_abertos`, `triagem_classificada`.

**Rollback:** desligar feature flag `recepcao.modulo`, voltar para sistema legado em < 5 min.

### PEP (depende da Fase 6)

**Aceitação:**
- [ ] Médico assina prescrição com certificado ICP-Brasil.
- [ ] Validações pré-prescrição (alergia, interação, dose) bloqueantes.
- [ ] Evolução salva com versão e diff em `auditoria_eventos`.
- [ ] Particionamento mensal funcionando.

**Rollback:** flag `pep.modulo` off → frontend mostra "PEP indisponível, usar papel".

### Farmácia (Fase 7)

**Aceitação:**
- [ ] Painel mostra prescrições em até 30 s.
- [ ] Dispensação atualiza estoque em tempo real.
- [ ] Livro de controlados (Portaria 344) gera relatório PDF assinado.

**Rollback:** flag `farmacia.painel` off → manter dispensação manual.

### Centro Cirúrgico (Fase 7)

**Aceitação:**
- [ ] Mapa de salas atualiza em tempo real (WS).
- [ ] EXCLUDE constraint impede agendamento sobreposto.
- [ ] Ficha cirúrgica + OPME + ficha anestésica salvas.

**Rollback:** flag `centro_cirurgico.modulo` off, agendamento em planilha.

### Faturamento (Fase 8)

**Aceitação:**
- [ ] Conta passa por todo o ciclo: ABERTA → ELABORADA → FATURADA.
- [ ] Lote TISS gerado e validado contra XSD oficial.
- [ ] Hash SHA-256 do XML armazenado.
- [ ] BPA/AIH/APAC para SUS gerados sem erros estruturais.

**Rollback:** flag `faturamento.modulo` off, não emitir contas novas.

### Repasse (Fase 9)

**Aceitação:**
- [ ] Apuração de competência calcula valores idênticos a duas execuções (idempotência).
- [ ] Folha de produção por prestador exporta Excel + PDF.
- [ ] Reapuração após reversão de glosa funciona.

**Rollback:** flag `repasse.modulo` off, repasse manual.

---

## 13. Treinamento

> Material publicado em `docs/training/` + LMS interno.

| Perfil          | Conteúdo                                         | Duração  | Formato            |
|-----------------|--------------------------------------------------|----------|--------------------|
| Admin           | Tenants, usuários, RBAC, auditoria, BI           | 16 h     | Presencial + lab   |
| DPO             | LGPD, RN-LGP-*, dual approval, exports FHIR      | 8 h      | Presencial         |
| Médico          | PEP, prescrição, assinatura ICP, telecons.       | 8 h      | EAD + tutorial UI  |
| Enfermeiro      | Triagem, sinais vitais, dispensação assistida    | 4 h      | EAD                |
| Farmacêutico    | Painel farmácia, controlados, dispensação        | 6 h      | Presencial         |
| Recepcionista   | Check-in, carteirinha, agenda, fila              | 4 h      | EAD                |
| Faturista       | Conta lifecycle, TISS, glosa, pacotes            | 12 h     | Presencial + lab   |

**Critério de aprovação:** prova prática (cenário real + checklist) com nota ≥ 80 %.

**Reciclagem:** anual obrigatória + sempre que houver mudança crítica (TISS nova versão, RN nova).

---

## Anexos

### A. Lista de runbooks específicos

- `docs/runbooks/db-failover.md`
- `docs/runbooks/redis-failover.md`
- `docs/runbooks/tiss-validacao-xsd.md`
- `docs/runbooks/lgpd-incidente.md`
- `docs/runbooks/restore-pitr.md`

### B. Contatos

| Papel              | Contato (24/7)              |
|--------------------|-----------------------------|
| DevOps de plantão  | `oncall-devops@hms.local`   |
| DBA de plantão     | `oncall-dba@hms.local`      |
| DPO / Encarregado  | `dpo@hms.local`             |
| CTO                | `cto@hms.local`             |
| Suporte clínico N1 | `suporte-clinico@hms.local` |

### C. Glossário rápido

- **PITR**: Point-In-Time Recovery (Postgres + WAL).
- **RTO**: Recovery Time Objective.
- **RPO**: Recovery Point Objective.
- **MV**: Materialized View (BI).
- **WS**: WebSocket.
- **DPO**: Data Protection Officer (Encarregado LGPD).
- **ANPD**: Autoridade Nacional de Proteção de Dados.
- **HMAC**: Hash-based Message Authentication Code (assinatura webhook).

---

> *Última atualização: 2026-05-04. Próxima revisão obrigatória: 2026-08-04 (trimestral).*
