# ARCHITECTURE.md — Arquitetura de Software

> Como o sistema está estruturado em camadas, módulos, contextos e como as peças conversam.
> Use junto com `STACK.md` (o que) e `DB.md` (dados).

---

## 1. Visão arquitetural em camadas

```
                 ┌─────────────────────────────────────────────────┐
                 │            Clientes (React, RN, Totem)          │
                 └───────────────┬─────────────────┬───────────────┘
                                 │ HTTPS/WS        │
                 ┌───────────────▼─────────────────▼───────────────┐
                 │         API Gateway / BFF (NestJS)              │
                 │  Auth · RBAC · Rate-limit · LGPD audit · OTel   │
                 └───┬───────────┬───────────┬───────────┬─────────┘
                     │           │           │           │
        ┌────────────▼────┐ ┌───▼──────┐ ┌──▼─────┐ ┌──▼───────┐
        │ Core API        │ │ TISS Svc │ │ AI Svc │ │ Realtime │
        │ (NestJS modular)│ │ (Node)   │ │ (Py)   │ │ (Socket) │
        └────┬─────┬──────┘ └────┬─────┘ └───┬────┘ └────┬─────┘
             │     │             │           │           │
             │     │             │           │           │
        ┌────▼─────▼─────────────▼───────────▼───────────▼─────┐
        │               PostgreSQL 16 (HA, partitioned)        │
        └────────────────────┬─────────────────────────────────┘
                             │
                  ┌──────────▼────────────┐  ┌──────────────────┐
                  │  Redis 7 (cache+queue)│  │ S3-compat storage│
                  └───────────────────────┘  └──────────────────┘
```

### Componentes

| Componente | Responsabilidade | Stack |
|---|---|---|
| **Core API** | Lógica de domínio (todos os 21 módulos) | NestJS, TS |
| **TISS Service** | Geração e validação de XML TISS, recepção de retornos | NestJS, package `@hms/tiss` |
| **AI Service** | OCR de documentos (DTA Vision), NLP em texto clínico | Python, FastAPI |
| **Realtime** | WebSocket gateway (mapa de leitos, painéis) | NestJS WebSocket + Redis Adapter |
| **API Gateway / BFF** | Em Fase 1 é o próprio NestJS Core. Em Fase 13+, separável (Kong/Traefik). | NestJS |

> **Decisão importante**: em Fase 1 o **Core API + Realtime + TISS** são **um único processo NestJS** (monolito modular). Separação em microsserviços só acontece quando há comprovado gargalo. AI Service já nasce separado por questão de stack.

---

## 2. Estilo arquitetural — Monolito Modular Hexagonal

Cada módulo de negócio segue **arquitetura hexagonal (ports & adapters)** com camadas:

```
modules/<bounded-context>/
├── domain/              # Camada de domínio - PURO, sem framework
│   ├── entities/        # Entidades: Patient, Account, Prescription...
│   ├── value-objects/   # CPF, CNS, Money, ProtocolColor...
│   ├── events/          # PatientAdmitted, PrescriptionSigned...
│   ├── ports/           # Interfaces de repositório (saída)
│   └── services/        # Domain services com regras complexas
├── application/         # Casos de uso
│   ├── use-cases/       # AdmitPatient, IssuePrescription, CloseAccount...
│   ├── dtos/            # Input/Output DTOs
│   └── ports/           # Interfaces de gateways externos
├── infrastructure/      # Adapters
│   ├── persistence/     # Implementações Prisma dos repositórios
│   ├── http/            # Controllers, request/response schemas
│   ├── websocket/       # Gateways WS
│   ├── messaging/       # Consumers BullMQ / Redis Streams
│   └── external/        # Integrações (TISS, ANS, RM, Anestech)
└── <module>.module.ts   # Wiring NestJS
```

**Regras de dependência (rígidas):**

```
domain ← application ← infrastructure
   ▲          ▲              ▲
   │          │              │
   ├─── domain importa NADA fora de si.
   ├─── application importa apenas domain (e ports).
   └─── infrastructure pode importar tudo, mas nunca o contrário.
```

ESLint enforça isso com `eslint-plugin-boundaries`.

---

## 3. Bounded Contexts

Cada contexto tem **dono claro** e **fronteira explícita**. Comunicação entre contextos só por:
1. **Use case público** chamado via interface;
2. **Evento de domínio** publicado em Redis Streams;
3. **API REST/RPC** quando o contexto for externalizado no futuro.

**Imports diretos cruzando fronteira são proibidos.**

| Contexto | Subdomínio | Tipo |
|---|---|---|
| **Identity & Access** | Auth, RBAC, MFA, multi-tenancy, audit log | Genérico |
| **Patient Registry** | Cadastro de paciente, histórico macro | Suporte |
| **Provider Registry** | Cadastro de prestadores e regras de vínculo | Suporte |
| **Insurance Registry** | Convênios, planos, tabelas, condições contratuais | Núcleo |
| **Catalog** | Procedimentos, materiais, medicamentos (TUSS/TUSS-OPME) | Suporte |
| **Scheduling** | Agendamento e agenda inteligente | Núcleo |
| **Reception** | Check-in, elegibilidade, autorização, triagem | Núcleo |
| **EHR (PEP)** | Evoluções, prescrições, exames, documentos clínicos | **Núcleo crítico** |
| **Inpatient & Beds** | Internação, mapa de leitos, transferências, alta | **Núcleo crítico** |
| **Pharmacy** | Dispensação, farmácia clínica, controlados | **Núcleo crítico** |
| **Surgery** | Centro cirúrgico, kits, gabaritos, OPME | **Núcleo crítico** |
| **CME** | Esterilização e rastreabilidade | Suporte |
| **Diagnostics** | Laboratório, imagem, central de laudos | Núcleo |
| **Infection Control (CCIH)** | Casos, cruzamentos, indicadores | Suporte |
| **Billing** | Conta do paciente, elaboração, fechamento | **Núcleo crítico** |
| **TISS Gateway** | XML TISS, validação XSD, lotes | **Núcleo crítico** |
| **SUS Gateway** | BPA, AIH, APAC | Núcleo |
| **Disallowance (Glosa)** | Recebimento, recurso, acompanhamento | Núcleo |
| **Physician Payout (Repasse)** | Apuração, folha, liberação | **Núcleo crítico** |
| **Treasury** | Caixa, particulares, integração financeira | Suporte |
| **Costing** | Custos por dimensão | Suporte |
| **SAME** | Documentos físicos e digitais | Suporte |
| **Visitors** | Controle de visitantes | Suporte |
| **Patient Portal** | Self-service paciente | Suporte |
| **Physician Portal** | Self-service médico | Suporte |
| **Analytics & BI** | Dashboards, relatórios | Suporte |
| **Integrations** | Backoffice RM, Anestech, labs externos, IA | Suporte |

> Os contextos marcados como **núcleo crítico** são os que mais merecem atenção em testes, code review e observabilidade.

---

## 4. Multi-tenancy

### 4.1 Estratégia: **Tenant ID em coluna**

- Cada hospital = um `tenant_id`.
- Toda tabela tenanted carrega `tenant_id BIGINT NOT NULL`.
- **Row-Level Security (RLS)** do PostgreSQL aplica filtro automático por `tenant_id` baseado em `current_setting('app.tenant_id')`.
- Middleware NestJS coloca o `tenant_id` do JWT no `SET LOCAL app.tenant_id = $1` no início de cada request.

### 4.2 Por que não schema-per-tenant?
- Migrations multiplicam por N hospitais (caos).
- Escala mal além de 50 tenants.
- Backups e replicação ficam complexos.

### 4.3 Por que não DB-per-tenant?
- Custos altos.
- Apenas justificável para clientes enterprise com exigência regulatória extrema (futuro).

### 4.4 Isolamento extra
- **Storage S3**: bucket único, prefix por tenant (`/{tenant_id}/...`), policy IAM por bucket.
- **Logs**: enriquecimento automático com `tenant_id`.
- **Métricas**: labels Prometheus por `tenant_id`.

---

## 5. Autenticação e autorização

### 5.1 Auth
- **JWT** assinado com **EdDSA (Ed25519)** ou **RS256**.
- Access token curto (15 min) + refresh token longo (7 dias) com rotação.
- **MFA** TOTP obrigatório para perfis com PHI; WebAuthn opcional.
- **SSO** SAML 2.0 / OIDC para integração com AD/Azure AD.

### 5.2 Authorization (RBAC + ABAC)
- **Perfis** (roles) cadastráveis por tenant.
- **Permissões** granulares: `patient:read`, `prescription:sign`, `account:close`, etc.
- **ABAC** (atributos) para regras como "médico só vê pacientes do seu setor" — implementado via **policies** (CASL.js).
- Política **deny-by-default**.

### 5.3 LGPD Audit
- Middleware automático em endpoints que tocam PHI.
- Grava em `auditoria_eventos`: `tenant_id, user_id, recurso, recurso_id, acao, ip, user_agent, finalidade, timestamp`.
- Imutável (append-only); particionado mensal.

---

## 6. Comunicação síncrona — REST + (futuro) GraphQL

### REST
- Padrão para 95% das chamadas.
- OpenAPI 3.1 gerado automaticamente.
- Convenções:
  - `GET /api/{recurso}` (lista + filtros)
  - `GET /api/{recurso}/{id}`
  - `POST /api/{recurso}` (cria)
  - `PUT /api/{recurso}/{id}` (substitui)
  - `PATCH /api/{recurso}/{id}` (atualiza parcial)
  - `DELETE /api/{recurso}/{id}` (soft-delete)
  - Ações específicas: `POST /api/{recurso}/{id}/{verbo}` (ex.: `/contas/{id}/fechar`)
- Pagination via `cursor` (preferido) ou `page+pageSize`.
- Filtros em query string com schema explícito.
- Versionamento por path (`/api/v1/...`).

### GraphQL (Fase 2+ — opcional)
- Apenas para o **portal do médico/paciente**, onde queries multi-recurso ajudam UX.
- NestJS suporta nativamente (`@nestjs/graphql`).

---

## 7. Comunicação assíncrona

### 7.1 Filas (BullMQ)
- **Jobs** com retry exponencial, dead-letter, prioridade.
- Filas críticas:
  - `tiss-generation` — geração de XMLs em massa.
  - `tiss-sending` — envio para webservice da operadora.
  - `pdf-generation` — espelho de conta, laudos, atestados.
  - `audit-flush` — buffer de auditoria para escrita em batch.
  - `notification` — SMS, email, WhatsApp.
  - `ocr` — submissão ao AI Service.

### 7.2 Eventos de domínio (Redis Streams)
- Cada evento é uma **mensagem imutável** com `id`, `tenant_id`, `event_type`, `aggregate_id`, `payload`, `version`, `occurred_at`.
- Consumidores idempotentes (chave de idempotência = `id` do evento).
- Retenção: 30 dias em Redis; arquivados em PostgreSQL `eventos_dominio` para replay/auditoria.

#### Eventos canônicos
- `patient.admitted`, `patient.discharged`, `patient.transferred`
- `prescription.issued`, `prescription.signed`, `prescription.cancelled`
- `dispensation.completed`
- `surgery.started`, `surgery.completed`
- `account.opened`, `account.closed`
- `tiss.batch.generated`, `tiss.batch.sent`, `tiss.batch.acknowledged`
- `disallowance.received`, `disallowance.appealed`, `disallowance.resolved`
- `payout.calculated`, `payout.released`

### 7.3 Outbox Pattern
- Eventos cross-context são primeiro escritos numa tabela `eventos_outbox` na **mesma transação** que muda o estado.
- Worker dedicado lê outbox e publica em Redis Streams.
- Garante consistência: se a transação roda, o evento sai. Se rolla, não sai.

### 7.4 Idempotência
- Toda operação POST que muda estado aceita header `Idempotency-Key`.
- Chaves armazenadas em Redis com TTL 24h.
- Permite retry seguro do cliente.

---

## 8. Tempo real (WebSocket)

### 8.1 Casos de uso
- **Mapa de leitos**: status de cada leito propagado em ≤ 2s.
- **Painel de farmácia**: nova prescrição aparece sem reload.
- **Painel de chamada**: chamadas de senha em monitor.
- **Mapa de salas cirúrgicas**: status das salas.
- **Notificações ao médico**: laudo liberado, autorização chegou.

### 8.2 Implementação
- **Socket.IO** com **Redis Adapter** para escala horizontal.
- **Namespaces** por `tenant_id`: `/{tenant_id}/beds`, `/{tenant_id}/pharmacy`, etc.
- **Rooms** por contexto: `bed-{leito_id}`, `setor-{setor_id}`.
- Auth via JWT no handshake.
- Sticky sessions garantidas via Ingress (K8s).

---

## 9. Persistência

Detalhamento completo em `DB.md`. Pontos arquiteturais:

- **PostgreSQL 16** primário.
- **Read replicas** para BI e relatórios pesados.
- **Particionamento mensal** em tabelas de alto volume.
- **Connection pooling** via PgBouncer.
- **Migrations** Prisma versionadas, aplicadas via job no startup.

---

## 10. Storage de arquivos

- **S3-compatible** (AWS S3, MinIO ou Wasabi).
- Estrutura: `s3://{bucket}/{tenant_id}/{tipo}/{ano}/{mes}/{uuid}.{ext}`
- Upload via **URLs assinadas** (pre-signed) emitidas pelo backend.
- **Antivírus** ClamAV em sidecar valida arquivo antes de marcar como `READY`.
- **Criptografia em repouso** SSE-KMS.
- **Tipos**: laudos (PDF), espelho de conta (PDF), digitalizações SAME, fotos de pacientes, anexos do PEP, XMLs TISS arquivados.

---

## 11. Integrações externas

| Integração | Direção | Protocolo | Observações |
|---|---|---|---|
| **TISS / ANS** | Bidirecional | SOAP/XML, REST conforme operadora | Cada operadora tem WS próprio; cliente HTTP genérico parametrizado |
| **DATASUS / SUS** | Saída | Arquivos (BPA-C/I, AIH, APAC) | Geração + transmissão SISBPA |
| **Backoffice RM** (TOTVS) | Bidirecional | API REST RM ou banco intermediário | Estoque, financeiro, contábil, compras |
| **Backoffice Protheus** | Bidirecional | Web Services Protheus | Alternativa ao RM |
| **Anestech** | Saída + leitura | API REST + arquivos | Ficha anestésica |
| **Laboratórios de apoio** | Bidirecional | HL7 v2.5 (preferido) ou REST customizado | Cada lab tem peculiaridades |
| **TOTVS Assinatura Eletrônica** | Saída | API REST + callback | Documentos clínicos |
| **ICP-Brasil** | Saída | Local (smart card / cert A1) | Assinatura no cliente ou via HSM no backend |
| **AI Service interno** | Saída | REST (JSON) | OCR, NLP |
| **WhatsApp / SMS / Email** | Saída | Twilio / Zenvia / SES | Notificações |
| **Daily.co (teleconsulta)** | Bidirecional | REST + JS SDK | Salas efêmeras por consulta |
| **PACS (imagens)** | Leitura | DICOM Web ou API do RIS | Visualização de imagens médicas |

Todas as integrações ficam no contexto **Integrations**, com **adapters** isolados (um adapter por sistema externo). Falha em integração externa **não pode quebrar fluxo clínico interno** — circuit breaker + fallback gracioso.

---

## 12. Observabilidade

### 12.1 Logs
- **pino** estruturado JSON.
- Sem PHI.
- Correlation-ID propagado via header `X-Request-ID`.
- Centralizados em **Loki**.

### 12.2 Métricas
- **OpenTelemetry SDK** → **Prometheus/Mimir**.
- Métricas custom obrigatórias por contexto:
  - `hms_prescriptions_signed_total{tenant_id}`
  - `hms_tiss_batches_generated_seconds{tenant_id, version}`
  - `hms_bed_status_changes_total{tenant_id, status}`
  - `hms_disallowance_value_total{tenant_id, convenio_id}`
- Dashboards Grafana versionados em `infra/grafana/`.

### 12.3 Traces
- **OpenTelemetry** → **Tempo**.
- Sampling: 100% em endpoints clínico-financeiros, 10% nos demais.
- Spans automáticos (HTTP, DB, Redis, BullMQ) + spans de domínio explícitos em use cases críticos.

### 12.4 Erros
- **Sentry** com PII scrubbing rigoroso.
- Rules: nunca enviar `cpf`, `cns`, `nome`, `prontuario_id`, conteúdo de evolução/prescrição/laudo.

---

## 13. Segurança em camadas

| Camada | Controles |
|---|---|
| Edge | WAF, rate-limit por IP, geo-blocking opcional |
| API | JWT, RBAC, ABAC, audit, rate-limit por usuário |
| Aplicação | Validação class-validator, sanitização, escaping |
| Banco | RLS, criptografia coluna, conexão criptografada, least privilege |
| Storage | URLs assinadas curtas, SSE-KMS, antivírus |
| Rede | VPC privada, security groups, não expor banco direto |
| Observabilidade | Sem PHI em logs/traces; alertas de acesso anômalo |
| Pessoas | MFA, princípio do menor privilégio, revisão de acessos trimestral |

---

## 14. Implantação

### 14.1 Ambientes
- **dev**: local, docker-compose.
- **staging**: K8s, dados sintéticos.
- **prod**: K8s gerenciado (EKS/GKE/AKS), HA.

### 14.2 Deploy
- **Helm charts** versionados.
- **GitOps** com ArgoCD (preferido) ou Flux.
- Estratégia: **rolling update** por padrão; **canary** em mudanças de TISS/faturamento.
- Health checks: `/healthz` (liveness), `/readyz` (readiness).

### 14.3 Configuração
- 12-factor: config via env vars.
- Secrets via **AWS Secrets Manager** ou **Vault**.
- Feature flags via **Unleash** (auto-hospedável).

---

## 15. Estratégia de testes

| Tipo | Ferramenta | Onde roda |
|---|---|---|
| Unit | Vitest | CI a cada push |
| Integration | Vitest + testcontainers (Postgres real) | CI |
| Contract | Pact | CI (TISS gateway, AI service) |
| E2E API | Supertest | CI nightly |
| E2E UI | Playwright | CI nightly |
| Load | k6 | Antes de cada release maior |
| Chaos | Litmus | Trimestral em staging |

**Fixtures TISS reais** mantidas em `packages/tiss/__fixtures__/` cobrindo cada tipo de guia em cada versão suportada.

---

## 16. Resiliência

- **Circuit breakers** em integrações externas (`opossum`).
- **Retry com backoff exponencial + jitter**.
- **Timeouts** explícitos em toda chamada externa.
- **Bulkheads**: cada integração externa tem **fila e pool próprios**.
- **Saga compensatória** para transações distribuídas (ex.: lote TISS rejeitado pela operadora libera valor para regerar).
- **Locks distribuídos** (Redlock) para alocação de leito, sala e kits.

---

## 17. Roadmap arquitetural

| Fase | Mudança arquitetural |
|---|---|
| **0–8** | Monolito modular. Tudo num processo NestJS. |
| **9–10** | Extração do TISS Service quando volume justificar. |
| **11–12** | Read replicas dedicadas para portais (não impactar OLTP do core). |
| **13** | AI Service, Realtime e TISS Service como deployments separados. |
| **Pós-produção piloto** | Avaliar microsserviço Go para geração TISS em massa se P95 ultrapassar SLA. |

---

## 18. Padrões e antipadrões

### Padrões adotados
- **DDD** + **Clean Architecture** + **Hexagonal**
- **CQRS leve** (read models materializados para BI/portais; OLTP normalizado)
- **Outbox**, **Saga**, **Event-driven** entre contextos
- **Repository pattern** com retorno de entidades de domínio
- **Specification pattern** para queries complexas no Disallowance e Repasse
- **Strategy pattern** para versões TISS

### Antipadrões proibidos
- ❌ **Anemic domain model** (entidades com getters e setters e regra no service)
- ❌ **Service layer omnipresente** sem use cases claros
- ❌ **God controller** com 30 endpoints
- ❌ **Imports cross-context** burlando a fronteira
- ❌ **Lógica de negócio em trigger SQL** (exceto auditoria, que é trigger por design)
- ❌ **`SELECT *` em produção**
- ❌ **N+1** sem `include` explícito do Prisma
- ❌ **`any` no TypeScript**

---

## 19. Diagramas adicionais

Em `docs/diagrams/` (criar conforme avanço):
- C4 modelo (Context, Container, Component) por contexto crítico.
- Sequence diagrams de fluxos críticos (admissão, prescrição, faturamento, repasse).
- ER diagrams gerados a partir do Prisma schema.

---

## 20. Resumo para o agente

1. **Monolito modular hexagonal** em NestJS, separável depois por necessidade.
2. **Bounded contexts** rigorosamente isolados — comunicação só por use case público, evento ou API.
3. **Multi-tenant** com `tenant_id` + RLS.
4. **REST primário**, eventos via **Redis Streams + Outbox**, **WebSocket** para tempo real.
5. **PostgreSQL** com particionamento, criptografia coluna e RLS.
6. **Observabilidade** ponta-a-ponta com OTel.
7. **Segurança** em camadas, LGPD-first.
8. **Resiliência** com circuit breaker, retry, bulkhead, saga.
9. **Testes obrigatórios** em fluxos críticos (TISS, repasse, prescrição, leito).
10. **Documentação como produto** — atualize-a sempre que mudar contrato.
