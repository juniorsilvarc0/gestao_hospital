# STACK.md — Decisão Tecnológica Fundamentada

> Este documento explica **por que** cada peça da stack foi escolhida. Decisões aqui têm efeito em toda a base de código. Mudanças exigem ADR (Architecture Decision Record).

---

## 1. Resumo executivo da decisão

| Camada | Escolha | Alternativas avaliadas | Decisão |
|---|---|---|---|
| Backend núcleo | **NestJS (TypeScript)** | Python/FastAPI, Go (Fiber/Echo), Java/Spring | NestJS |
| Backend IA isolada | **Python/FastAPI** | TypeScript com onnxruntime, Rust | Python |
| Banco | **PostgreSQL 16** | MySQL, SQL Server, MongoDB | PostgreSQL |
| ORM | **Prisma** | TypeORM, MikroORM, Drizzle, Kysely | Prisma (com fallback Kysely para queries pesadas) |
| Cache/Filas | **Redis 7 + BullMQ** | RabbitMQ, Kafka, NATS | Redis |
| Frontend | **React 18 + Vite + Tailwind + shadcn/ui** | Next.js, Angular, Vue | React + Vite (SPA, não há SEO) |
| Tempo real | **Socket.IO** | Server-Sent Events, raw WebSocket, Centrifugo | Socket.IO |
| TISS | **xmlbuilder2 + xsd-schema-validator** | DOM nativo, libxmljs | xmlbuilder2 |

---

## 2. A questão central — Por que NestJS e não Go ou Python?

Você levantou a pergunta certa: o documento original sugeriu Node/NestJS **ou** Python/FastAPI, e questionou se Go entraria. Vou ser direto e honesto na análise.

### 2.1 O que estamos construindo, em uma frase

Um sistema de **20+ módulos transacionais com regras de negócio densas** (faturamento TISS, repasse, glosa, prescrição com alertas clínicos), **alta integração** (TISS/SUS/RM/Anestech/labs), **tempo real moderado** (mapa de leitos, painel farmácia), **dados sensíveis** (LGPD/PHI), e **time multi-agente** desenvolvendo em paralelo via Claude Code.

Esse perfil é **CRUD-rico, regra-rico, integração-rica, latência-tolerante**. Não é "API de altíssimo throughput com lógica simples".

### 2.2 Avaliação por critério

#### Produtividade de desenvolvimento (peso ALTO — 13 fases, prazo apertado, agentes em paralelo)

| | Node/NestJS | Python/FastAPI | Go |
|---|---|---|---|
| LOC para mesmo CRUD com validação, doc, auth | 1x (referência) | 1.1x | 2.5x — 3x |
| Maturidade de boilerplate (auth, RBAC, audit, swagger) | NestJS resolve quase tudo via decorators | FastAPI bom, mas menos "completo" | Cada projeto monta o seu |
| DDD/Clean Architecture out-of-the-box | Sim, NestJS é desenhado para isso | Possível, manual | Possível, totalmente manual |
| Geração de docs OpenAPI | Automática via decorators | Excelente (FastAPI é referência) | Manual ou via tags em comentários |

**Vencedor:** NestJS, com FastAPI próximo. Go fica significativamente atrás em velocidade de entrega para um sistema regulatório com 20 módulos.

#### Domínio brasileiro de saúde (peso CRÍTICO)

| | Node/NestJS | Python/FastAPI | Go |
|---|---|---|---|
| Bibliotecas para TISS | Existe ecossistema npm para XML/XSD; comunidade pequena mas ativa | Boa lib XML; uso real em healthtechs brasileiras | **Quase inexistente**; teria que portar |
| Integração com TOTVS Assinatura, certificados ICP-Brasil | Libs Node existem (lib-cades, node-forge) | Libs Python existem (signxml, endesive) | Bibliotecas escassas |
| Geração de BPA/AIH (SUS) | Possível, via libs próprias | Possível | Possível, mais trabalho |

**Vencedor:** Empate Node/Python. Go perde — não pelo idioma técnico, mas pela falta de bibliotecas locais.

#### Performance (peso BAIXO neste sistema)

| | Node | Python | Go |
|---|---|---|---|
| Throughput em I/O concorrente (perfil deste sistema) | 10–30k req/s típico | 5–15k req/s | 50–150k req/s |
| CPU-bound (geração de XML em massa) | Razoável | Pior (GIL) | Excelente |
| Memória por conexão WebSocket | ~50 KB | ~80 KB | ~5 KB |

A pergunta certa não é "qual é mais rápido" — é "o sistema precisa dessa performance?".

Cálculo de carga realista para um hospital grande (500 leitos, 50 ambulatórios, ~3000 atendimentos/dia):
- Pico de requisições: ~200 req/s
- Conexões WebSocket simultâneas: ~500 (mapa de leitos + painel farmácia + recepção)
- Geração de TISS: lotes de 100–500 guias rodando em background

**Node aguenta isso com folga.** Go seria luxo desnecessário e custaria 2–3x mais código.

**Quando Go faria diferença real?** Se fôssemos atender **rede com 50+ hospitais** num único cluster (multi-tenant pesado) com pico de 5k req/s. Aí, sim. **Não é o caso da Fase 1.**

#### Manutenibilidade (peso ALTO)

| | Node/NestJS | Python/FastAPI | Go |
|---|---|---|---|
| Tipagem estática | TS strict (excelente) | Pyright/mypy (bom mas opt-in) | Nativo |
| Refatoração segura | Excelente (TS + IDE) | Boa | Excelente |
| Curva de onboarding (devs juniores e mid) | Curva NestJS leve | Muito leve (FastAPI) | Steep — Go é simples mas idiomatic Go é raro |
| Disponibilidade de devs no mercado BR | Abundante | Abundante | Escasso |

**Vencedor:** Node ou Python. Go cria gargalo de contratação no Brasil para healthcare.

#### Compartilhamento de código com frontend (peso ALTO neste projeto)

O frontend é React+TS. Com NestJS:
- DTOs, enums, validações **compartilhados** via `packages/shared-types`
- Tipos da API derivados do backend e consumidos no frontend sem duplicação
- Validação client-side + server-side com a **mesma fonte** (`class-validator`, ou Zod via OpenAPI)

Isso elimina toda uma classe de bug ("o frontend mandou um campo que o backend não esperava"). É **a única decisão que sozinha justifica TS no backend** quando o frontend já é TS.

Com Python ou Go, perdemos isso. Existem geradores de cliente OpenAPI, mas a experiência de desenvolvedor é inferior.

#### Suporte do Claude Code (peso ALTO — quem vai codar é Claude)

NestJS tem **massa crítica** no corpus de treinamento. Padrões muito previsíveis (decorators, módulos, providers). FastAPI também. **Go também é suportado**, mas o ecossistema healthcare brasileiro em Go é tão pequeno que o agente terá que inventar muito mais.

#### Aspectos onde Go realmente brilha

Vou ser justo. Go é melhor que Node/Python para:
- Microsserviços de **gateway WebSocket** com 100k+ conexões (caso de Discord/Twitch).
- **CLI tools** e ferramentas de migração offline.
- Geração de **XML em massa** com paralelismo agressivo (goroutines).
- Footprint de memória em containers (importante em K8s ultra-densos).

Nenhum desses é um *gargalo atual* do HMS-BR. Mas pode ser **uma evolução futura** — ver §6.

### 2.3 Decisão final

**Núcleo em NestJS + TypeScript.** Pelos motivos:
1. Compartilhamento de tipos com o frontend React/TS → -30% bugs de contrato.
2. NestJS resolve auth, RBAC, validação, OpenAPI e DDD com baixo boilerplate.
3. Bibliotecas brasileiras para TISS, SUS, ICP-Brasil mais maduras em JS/TS do que em Go.
4. Carga prevista cabe em Node com folga.
5. Onboarding de desenvolvedores e suporte do Claude Code são significativamente melhores.

**Microsserviço de IA em Python/FastAPI.** Para OCR (admissão via documentos), NLP em texto clínico, modelos de classificação. Python é insubstituível aqui (PyTorch, Transformers, Tesseract, paddleocr).

**Go: reservado para o futuro** (ver §6), não como Fase 1.

---

## 3. Banco de dados — PostgreSQL 16

Decisão fácil. PostgreSQL ganha por:

- **JSONB** com indexação GIN: essencial para formulários dinâmicos do PEP (anamnese, evolução, sinais vitais), `endereco`, `contatos`, `condicoes_contratuais` (que variam radicalmente por convênio).
- **Particionamento nativo** por range de data: viabiliza tabelas que crescem rápido (`evolucoes`, `prescricoes`, `dispensacoes`).
- **Extensões** que vamos usar pesadamente:
  - `pgcrypto` — criptografia coluna a coluna (CPF, CNS, conteúdo clínico livre).
  - `uuid-ossp` — IDs externos que não vazem cardinalidade.
  - `pg_trgm` — busca por similaridade em nomes de pacientes e medicamentos (`Joana` ≈ `Joanna`).
  - `btree_gin` — índices compostos eficientes em JSONB + colunas escalares.
  - `tsvector` (full-text) — busca em prontuário e laudos.
- **MVCC** sólido para alta concorrência transacional.
- **Compliance**: HIPAA-ready, replicação síncrona para HA, backup PITR (point-in-time recovery).
- **Custo**: open source, suporte profissional disponível (EnterpriseDB, Crunchy, Cloud managed).

**Por que não MongoDB?** Porque faturamento hospitalar é **massivamente relacional**. Conta → Itens → Procedimento → Tabela de Preços → Convênio → Plano → Condição Contratual. Documentos seriam pesadelo de consistência. JSONB do Postgres dá o melhor dos dois mundos quando precisamos de flexibilidade (PEP).

**Por que não SQL Server?** Custo de licença + compatibilidade limitada com ferramentas open source. TOTVS já cobra esse pedágio — a proposta aqui é diferenciação.

---

## 4. ORM — Prisma como padrão, Kysely como fallback

### Prisma
- **DX excelente**, geração automática de tipos a partir do schema.
- Migrations sólidas e versionadas.
- Boa para 90% das queries.

### Limitações conhecidas do Prisma (e como contornar)
- Queries **muito complexas** (ex.: apuração de repasse, dashboards de glosas) podem gerar SQL ruim.
- **Solução:** usar **Kysely** (query builder tipado) ou **SQL puro** via `$queryRawTyped` para hot paths.
- Estabelecemos *opt-in* — Prisma por padrão; Kysely apenas em casos identificados.

### Por que não TypeORM?
Manutenção mais lenta, decorators menos ergonômicos com Prisma sendo a referência atual, migrations menos confiáveis.

---

## 5. Filas e tempo real — Redis + BullMQ + Socket.IO

### Redis 7 + BullMQ
- **Filas robustas** com retry, dead-letter, prioridades, agendamento (precisamos disso para faturamento em lote, geração de PDF, OCR).
- Reaproveitamos Redis também para:
  - Cache de elegibilidade de convênio (TTL curto).
  - Lock distribuído para prevenir double-booking de leitos/salas.
  - Pub/sub leve.
  - Sessões e rate-limiting.

### Por que não RabbitMQ ou Kafka?
- **RabbitMQ**: melhor que Redis em filas com SLA crítico, mas adiciona infraestrutura. BullMQ + Redis cobre nossas necessidades. Se em escala precisarmos, migramos.
- **Kafka**: overkill para o volume previsto. Eventos de domínio cabem em **Redis Streams** (já temos Redis).

### Socket.IO
- Múltiplos clientes (web, totem, painel TV) com **namespaces** por hospital.
- Reconexão automática, transports fallback.
- Excelente integração com NestJS via `@nestjs/websockets`.
- Pub/sub via Redis Adapter para escalar horizontalmente.

### Por que não SSE?
SSE é unidirecional. Painel de farmácia e mapa de leitos têm **interações cliente→servidor** (drag-and-drop de leito, marcação de dispensação). Bidirecional > unidirecional aqui.

---

## 6. Onde Go entra (talvez, no futuro)

Reservamos Go como **opção arquitetural futura**, **não Fase 1**. Cenários onde reabriríamos a discussão:

| Cenário | Solução em Go | Quando reavaliar |
|---|---|---|
| Geração de TISS XML em massa para 50+ hospitais simultâneos | Microsserviço Go consumindo fila e gerando XML em paralelo | Quando o tempo de geração de lotes em Node ultrapassar 30s no P95 |
| Gateway WebSocket para 50k+ conexões simultâneas | Edge service em Go com Centrifugo | Quando o número de conexões simultâneas por instância ultrapassar 5k |
| CLI de migração de dados legados (DBF, .doc) | Binário Go standalone | Imediatamente disponível se necessário |

Importante: **microsserviços extras só entram quando o monolito modular comprovadamente não dá conta**. Engenharia de hospital exige confiabilidade, e mais peças móveis aumentam pontos de falha.

---

## 7. Frontend — React 18 + Vite + Tailwind + shadcn/ui

- **React 18**: padrão de mercado, ecossistema maduro, melhor suporte do Claude Code.
- **Vite**: build rápido, HMR confiável. Não usamos Next.js porque **não há SEO** (sistema interno + portais autenticados).
- **TypeScript strict**: integridade de tipos com o backend NestJS.
- **Tailwind + shadcn/ui**: componentes acessíveis (WAI-ARIA), customizáveis, sem lock-in (você cola o código no projeto). Crítico para o PEP onde precisamos componentes específicos do domínio clínico.
- **React Query (TanStack Query)**: gerência de estado servidor — caching, invalidação, optimistic updates. Zustand para estado client-side.
- **TipTap** (sobre ProseMirror) para o editor do PEP — formulários dinâmicos, formatação rica, anotações estruturadas.
- **FullCalendar** para agenda multi-recurso (consultórios, salas, profissionais).
- **react-flow** ou **Konva** para mapa de leitos (drag-and-drop, render performático).

---

## 8. Mobile — React Native (com fallback Flutter para teleconsulta)

- **React Native** mantém time único de TS, compartilhando types com o backend e parte da lógica com web.
- **Por que não Flutter?** Bom framework, mas teríamos que duplicar tipos e lógica de negócio em Dart. Custo de manutenção alto para um time pequeno.
- **Teleconsulta**: usamos **Daily.co** SDK (suporta web e mobile RN nativamente) para evitar reinventar WebRTC.

---

## 9. Observabilidade — OpenTelemetry + Grafana stack

- **OpenTelemetry**: traces, métricas, logs com vendor-neutralidade.
- **Grafana Tempo** (traces) + **Loki** (logs) + **Mimir/Prometheus** (métricas).
- **Sentry** para erros frontend e backend (com PII scrubbing — crítico LGPD).
- **Audit log dedicado**: vai para PostgreSQL (`auditoria_eventos`), não para Loki — auditoria é parte do banco transacional para garantir consistência.

---

## 10. Stack auxiliar relevante

| Função | Escolha | Por quê |
|---|---|---|
| Auth | **JWT + refresh** + **Passport.js** | Padrão maduro, integração natural com NestJS |
| MFA | **TOTP** (Google Authenticator etc.) + **WebAuthn** opcional | Médicos esperam MFA simples; WebAuthn para admin |
| Storage de arquivos | **S3-compatible** (AWS S3 ou MinIO) | Laudos, imagens, documentos digitalizados (SAME) |
| Antivírus em uploads | **ClamAV** sidecar | Compliance hospitalar |
| Email | **AWS SES** ou **Sendgrid** | Notificações, links de teleconsulta, atestados |
| SMS / WhatsApp | **Zenvia** ou **Twilio** | Confirmação de consulta, lembrete |
| PDF | **Puppeteer** (laudos, guias TISS impressas) + **PDFKit** (espelho rápido de conta) | Puppeteer = HTML→PDF fiel; PDFKit = velocidade |
| OCR | **PaddleOCR** (Python) + **Tesseract** fallback | DTA Vision para admissão |
| LLM em prontuário (futuro) | API externa (Anthropic Claude) **com PHI mascarado** | Resumo de evolução, sugestão de CID — sempre com revisão humana |
| CI | **GitHub Actions** | Padrão, free tier generoso |
| Container | **Docker + Helm** | Deploy padronizado em K8s |
| Orquestração | **Kubernetes** (managed: EKS/GKE/AKS) | HA, escala horizontal |
| Secrets | **AWS Secrets Manager** ou **HashiCorp Vault** | LGPD exige rotação |

---

## 11. Riscos tecnológicos identificados

| Risco | Mitigação |
|---|---|
| Prisma fica lento em queries de dashboard de glosas | Hot path em Kysely; índices materializados |
| Socket.IO não escala além de N instâncias | Redis Adapter + sticky sessions; se passar de 10 instâncias, avaliar Centrifugo |
| Versões TISS evoluem (4.0 → 5.0) | Strategy pattern por versão; cada versão é um módulo isolado em `packages/tiss/` |
| LGPD audit log explode em volume | Particionamento mensal + retenção controlada por política |
| OCR falha em documentos manuscritos | Fallback para entrada manual; nunca bloquear admissão por falha de OCR |
| Bibliotecas TISS open source são imaturas | Tratamos `packages/tiss` como **produto interno crítico** com suite de testes própria |

---

## 12. ADRs (Architecture Decision Records)

Toda mudança nesta stack exige um ADR em `docs/adr/NNNN-titulo.md` seguindo template MADR. Decisões já formalizadas:

- ADR-0001: NestJS como backend núcleo
- ADR-0002: PostgreSQL com extensões (pgcrypto, uuid-ossp, pg_trgm, btree_gin)
- ADR-0003: Prisma como ORM padrão, Kysely como fallback
- ADR-0004: Redis + BullMQ para filas; Redis Streams para eventos cross-context
- ADR-0005: Socket.IO para tempo real
- ADR-0006: Microsserviço Python/FastAPI isolado para IA/OCR
- ADR-0007: Go reservado para evolução, não Fase 1
- ADR-0008: Multi-tenant por `tenant_id` em coluna (não schema-per-tenant nem DB-per-tenant)

---

## 13. TL;DR para o Claude Code

> Use **NestJS + TypeScript** para tudo no backend, exceto IA/OCR que vai num microsserviço **Python/FastAPI**. Banco é **PostgreSQL 16**, ORM é **Prisma** (Kysely para queries pesadas). Filas e cache em **Redis + BullMQ**. Tempo real em **Socket.IO**. Frontend **React + Vite + Tailwind + shadcn**. **Não use Go, Java, PHP nem Ruby.** Não introduza nova dependência sem registrar no `package.json` correto e justificar em comentário no PR.
