# HMS-BR — Hospital Management System Brasileiro

![CI](https://github.com/juniorsilvarc0/gestao_hospital/actions/workflows/ci.yml/badge.svg)

Sistema multi-tenant de gestão hospitalar com compliance **TISS/SUS/LGPD/ICP-Brasil**, equivalente em escopo ao TOTVS Saúde — Hospitais e Clínicas (Linha RM).

> **Documentação canônica em [`CLAUDE.md`](CLAUDE.md) e [`docs/`](docs/).**
> Em conflito entre docs, a precedência é: `DB.md` > `ARCHITECTURE.md` > `PRD.md` > `SPEC.md`.

---

## Pré-requisitos

- **Apenas Docker e Docker Compose v2** instalados no host.
- **Não instalar Node, Postgres, Redis, Python no host** — tudo roda em containers.

---

## Como rodar (em construção — Fase 1)

```bash
cp .env.example .env
make up        # sobe todos os serviços
make migrate   # roda migrations dentro do container api
make seed      # popula tenant dev + admin
```

Acesse:

| Serviço | URL |
|---|---|
| Web (frontend) | http://localhost:5173 |
| API (REST) | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/api/docs |
| Mailhog (e-mail dev) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
| Adminer (DB inspect) | http://localhost:8080 |

---

## Estrutura

```
hms-br/
├── apps/
│   ├── api/          NestJS + Prisma — núcleo
│   ├── web/          React + Vite + Tailwind + shadcn/ui
│   ├── ai-service/   FastAPI (Python) — OCR/NLP, ativado a partir da Fase 11
│   └── mobile/       React Native — Fase 12+
├── packages/
│   ├── domain/       entidades de domínio puras (sem framework)
│   ├── shared-types/ DTOs compartilhados api ↔ web
│   ├── tiss/         lib geração/validação TISS XML
│   ├── sus/          lib BPA/AIH/APAC
│   └── config/       tsconfig/eslint/prettier base compartilhados
├── docker/           init.sql + configs auxiliares
├── infra/            docker-compose para deploy + Helm + Terraform (futuro)
└── docs/             documentação por tópico (01–09)
```

Internamente, cada módulo NestJS segue **arquitetura hexagonal** (domain / application / infrastructure). Ver [`ARCHITECTURE.md`](ARCHITECTURE.md) §2.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend núcleo | **NestJS** + TypeScript (Node 20 LTS) |
| Backend IA | **FastAPI** + Python 3.12 (microsserviço isolado) |
| Banco | **PostgreSQL 16** (RLS, particionamento, JSONB) |
| ORM | **Prisma** 5.x |
| Cache / Filas | **Redis 7** + BullMQ + Streams |
| Frontend | **React 18** + Vite + Tailwind + shadcn/ui |
| Tempo real | **Socket.IO** + Redis Adapter |
| Editor PEP | TipTap |
| TISS | xmlbuilder2 + xsd-schema-validator |

Decisões fundamentadas em [`STACK.md`](STACK.md).

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Guia mestre para agentes Claude Code |
| [`SPEC.md`](SPEC.md) | Especificação de produto |
| [`PRD.md`](PRD.md) | Requisitos funcionais e não-funcionais |
| [`STACK.md`](STACK.md) | Decisões de stack + ADRs |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Arquitetura de software |
| [`DB.md`](DB.md) | **Modelagem de banco — fonte da verdade** |
| [`docs/00-prompt-mestre.md`](docs/00-prompt-mestre.md) | Prompt mestre original |
| [`docs/01-visao-geral.md`](docs/01-visao-geral.md) | Visão geral, atores, 21 módulos |
| [`docs/02-modelo-dados.md`](docs/02-modelo-dados.md) | Modelo de dados (resumo) |
| [`docs/03-regras-negocio.md`](docs/03-regras-negocio.md) | 96 regras de negócio (RN-XXX-NN) |
| [`docs/04-fluxos-processo.md`](docs/04-fluxos-processo.md) | Fluxos de processo |
| [`docs/05-apis-rest.md`](docs/05-apis-rest.md) | Catálogo de endpoints REST |
| [`docs/06-interfaces-telas.md`](docs/06-interfaces-telas.md) | Telas e UX |
| [`docs/07-stack-tecnologica.md`](docs/07-stack-tecnologica.md) | Stack (resumo executivo) |
| [`docs/08-instrucoes-claude-code.md`](docs/08-instrucoes-claude-code.md) | Plano de execução em 13 fases |
| [`docs/09-glossario.md`](docs/09-glossario.md) | Glossário de domínio |

---

## Status

| Fase | Estado |
|---|---|
| **1 — Fundação** | em construção |
| 2 — Identidade & Acesso | pendente |
| 3 — Cadastros Gerais | pendente |
| 4 — Agendamento | pendente |
| 5 — Recepção & Atendimento | pendente |
| 6 — PEP | pendente |
| 7 — Farmácia & Centro Cirúrgico | pendente |
| 8 — Faturamento, TISS, Glosas | pendente |
| 9 — Repasse Médico | pendente |
| 10 — CME, CCIH, SAME, Visitantes | pendente |
| 11 — Portais & Integrações | pendente |
| 12 — BI & Indicadores | pendente |
| 13 — Hardening & Go-Live | pendente |

Plano detalhado em [`docs/08-instrucoes-claude-code.md`](docs/08-instrucoes-claude-code.md).
