# 07 — Stack Tecnológica (Resumo)

> Resumo executivo da stack. **Decisões fundamentadas e ADRs em `STACK.md`.**

---

## 1. Camadas e escolhas

| Camada | Tecnologia | Versão alvo |
|---|---|---|
| **Backend núcleo** | NestJS + TypeScript | Node 20 LTS, NestJS 10+ |
| **Backend IA** | FastAPI + Python | Python 3.12 |
| **Banco principal** | PostgreSQL | 16 |
| **Cache / Filas** | Redis + BullMQ + Streams | Redis 7 |
| **Frontend web** | React + TypeScript + Vite + Tailwind + shadcn/ui | React 18+ |
| **Mobile** | React Native | 0.74+ |
| **Tempo real** | Socket.IO + Redis adapter | — |
| **ORM** | Prisma | 5.x |
| **Editor PEP** | TipTap | — |
| **PDF** | Puppeteer (rico) + PDFKit (rápido) | — |
| **Storage** | S3-compatible (AWS S3, MinIO, GCS) | — |
| **Auth** | JWT (curto) + Refresh rotativo | — |
| **Senha** | Argon2id | — |
| **Assinatura digital** | ICP-Brasil PAdES (lib-cades) | — |
| **Observabilidade** | OpenTelemetry → Grafana/Tempo/Loki | — |
| **CI/CD** | GitHub Actions | — |
| **Containers** | Docker + Helm | — |
| **IaC** | Terraform | — |

---

## 2. Por que NestJS e não Go ou Python?

**Resumo da análise (detalhe completo em `STACK.md` §2):**

- **Go**: excelente em latência baixa e concorrência. **Inadequado** para o núcleo aqui porque (a) o sistema é 70% regras de negócio densas onde Go tem alta densidade de código, (b) ecossistema TISS/SUS/ICP-Brasil é fraco em Go, (c) JSONB dinâmico do PEP é fricção crônica, (d) não compartilha tipos com o frontend TS. **Reservado** para microsserviço futuro de geração TISS em escala (>500k guias/mês).
- **Python (FastAPI)**: ótimo, mas perde para NestJS em (a) estruturação modular para 20+ módulos, (b) compartilhamento de tipos com frontend, (c) ecossistema TISS em Node. **Mantido** como microsserviço isolado para IA/OCR/NLP.
- **NestJS (TypeScript)**: vence por (a) modularização DI nativa, (b) tipos compartilhados com React, (c) ecossistema healthcare BR maduro em Node, (d) velocidade de entrega, (e) pool de devs.

---

## 3. Dependências críticas (npm) por contexto

### Backend núcleo

| Pacote | Função |
|---|---|
| `@nestjs/core`, `@nestjs/common` | Framework |
| `@nestjs/platform-express` | HTTP |
| `@nestjs/swagger` | OpenAPI gerado |
| `@nestjs/websockets`, `@nestjs/platform-socket.io` | WebSocket |
| `@nestjs/bullmq` | Filas |
| `@nestjs/throttler` | Rate limit |
| `@prisma/client`, `prisma` | ORM |
| `class-validator`, `class-transformer` | DTOs |
| `zod` | Validação interna (eventos) |
| `bcrypt`, `argon2` | Hash de senhas |
| `jose` ou `jsonwebtoken` | JWT |
| `pino`, `nestjs-pino` | Logger |
| `helmet`, `csurf` | Segurança HTTP |
| `xmlbuilder2`, `libxmljs2` | TISS XML |
| `puppeteer`, `pdfkit` | PDFs |
| `socket.io-redis-adapter` | Pub/sub |
| `bullmq` | Jobs |
| `cache-manager`, `cache-manager-redis-yet` | Cache |
| `nestjs-otel` ou OpenTelemetry SDK | Observabilidade |

### Backend IA (Python)

| Pacote | Função |
|---|---|
| `fastapi` | Framework |
| `uvicorn` | ASGI |
| `pydantic` | DTOs |
| `tesseract-ocr` (system) + `pytesseract` | OCR |
| `transformers`, `torch` | NLP |
| `spacy` + modelo `pt_core_news_lg` | NLP PT-BR |
| `pillow`, `opencv-python` | Pré-proc. de imagens |

### Frontend

| Pacote | Função |
|---|---|
| `react`, `react-dom`, `react-router-dom` | Base |
| `@tanstack/react-query` | Cache de queries |
| `zustand` | Estado leve |
| `react-hook-form` + `zod` | Formulários |
| `tailwindcss`, `@headlessui/react` | Estilo |
| `lucide-react` | Ícones |
| `recharts` | Gráficos |
| `@fullcalendar/react` | Agenda |
| `@tiptap/react` + extensões | Editor |
| `socket.io-client` | WebSocket |
| `@dnd-kit/core` | Drag-and-drop |
| `cornerstone-core` (futuro) | DICOM web |

---

## 4. Versionamento e atualizações

- **Node**: travar em LTS atual (20). Mover para 22 quando 22 for LTS estável (~6 meses após release).
- **PostgreSQL**: travar em major (16). Upgrade major exige plano (logical replication para zero downtime).
- **Prisma**: minor automático, major com testes de regressão.
- **NestJS**: minor automático; major com migration guide.

---

## 5. Variáveis de ambiente (chaves principais)

Lista parcial — ver `.env.example` no repo:

```
# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgres://user:pass@host:5432/hms_br
DATABASE_POOL_MAX=20

# Redis
REDIS_URL=redis://host:6379/0

# Auth
JWT_ACCESS_SECRET=<base64>
JWT_REFRESH_SECRET=<base64>
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

# Storage
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=hms-br-prod
S3_REGION=sa-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# TISS
TISS_VERSAO_DEFAULT=4.01.00
TISS_VALIDADOR_XSD_PATH=./assets/tiss-xsd

# ICP-Brasil
ICP_AUTHORITY_CHAIN_PATH=./assets/icp-chain.pem

# Observabilidade
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=hms-br-api

# IA
AI_SERVICE_URL=http://ai-service:8000
```

---

## 6. Quando reabrir a discussão de stack

- Volume de geração TISS > 500k guias/mês → considerar `tiss-engine` em Go.
- Eventos cross-tenant > milhões/dia → migrar Redis Streams → Kafka.
- Necessidade de offline robusto no PEP → adicionar PWA + IndexedDB + sync.
- LGPD on-premises restrita → trocar Daily.co por Jitsi self-hosted.

Toda mudança vira ADR em `docs/adr/`.
