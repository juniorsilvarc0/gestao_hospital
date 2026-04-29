# CLAUDE.md — Guia Mestre para Agentes Claude Code

> **Sistema de Gestão Hospitalar (HMS-BR)**
> Documento de orientação obrigatório para qualquer agente do Claude Code que for atuar neste repositório.
> Versão 1.0 — Março/2026 · Idioma de código: inglês · Idioma de domínio/UI: português (Brasil)

---

## 0. Como ler esta documentação

Antes de escrever **qualquer linha de código**, o agente deve ler nesta ordem:

1. **`CLAUDE.md`** (este arquivo) — princípios, padrões e regras invioláveis.
2. **`SPEC.md`** — visão de produto e escopo macro.
3. **`PRD.md`** — requisitos funcionais e não-funcionais detalhados.
4. **`STACK.md`** — decisão tecnológica e justificativas (importante para entender *por que* NestJS).
5. **`ARCHITECTURE.md`** — arquitetura de software, camadas, módulos, fronteiras de contexto.
6. **`DB.md`** — modelagem de dados (**fonte da verdade absoluta** sobre persistência).
7. **`docs/0X-*.md`** — o documento da seção em que você for atuar.
8. **`skills/0X-*/SKILL.md`** — checklist operacional da fase/módulo.

> Em caso de **conflito entre documentos**, a precedência é: `DB.md` > `ARCHITECTURE.md` > `PRD.md` > `SPEC.md` > demais. Se ainda houver dúvida, **pergunte antes de codar**.

---

## 1. Identidade do Sistema

| Item | Valor |
|---|---|
| **Nome** | HMS-BR (Hospital Management System Brasil) |
| **Inspiração funcional** | TOTVS Saúde — Hospitais e Clínicas (Linha RM) |
| **Domínio** | Gestão hospitalar completa: ciclo do paciente, PEP, faturamento TISS/SUS, repasse, glosas, farmácia, centro cirúrgico, CME, CCIH |
| **Compliance** | LGPD, padrão TISS (ANS), tabelas TUSS/CBHPM/AMB/SUS, ICP-Brasil para assinatura |
| **Multi-tenant** | Sim (uma instância serve múltiplos hospitais/grupos) — ver `ARCHITECTURE.md` §4 |
| **Idioma de UI** | Português brasileiro |
| **Idioma do código** | Inglês (variáveis, funções, comentários técnicos), porém **nomes de tabelas e colunas em português** para fidelidade ao domínio TISS/SUS |

---

## 2. Princípios de engenharia (não negociáveis)

### 2.1 Segurança e privacidade
- **LGPD-first**: todo acesso a dado de paciente passa por *audit log* automático (quem, quando, qual registro, qual campo, qual finalidade).
- Criptografia em repouso para colunas sensíveis (CPF, CNS, alergias, anotações clínicas livres) usando `pgcrypto`.
- TLS 1.3 obrigatório em trânsito.
- **Zero PHI em logs de aplicação**. Use IDs e correlation-IDs, nunca o conteúdo do prontuário.
- Soft-delete em **todas** as tabelas clínicas (`deleted_at`, `deleted_by`). Nunca `DELETE` físico em prontuário.

### 2.2 Integridade clínica
- Prescrições, evoluções, laudos e dispensações são **imutáveis após assinatura digital**. Correções entram como nova versão com vínculo `versao_anterior_id`.
- Toda alteração relevante em entidade clínica gera registro em `auditoria_eventos`.
- Validações clínicas (alergia, interação, dose máxima) são **bloqueantes** — quem ignora deve justificar e a justificativa fica registrada.

### 2.3 Faturamento e dinheiro
- Valores monetários: `DECIMAL(18,4)` no banco e `decimal.js` (Node) na aplicação. **Jamais `float`**.
- Cálculos de faturamento, glosa e repasse devem ser **idempotentes** e **auditáveis** (executar duas vezes produz o mesmo resultado e gera trilha).
- Geração TISS deve **validar contra XSD oficial da ANS** antes do envio. Falha de validação ⇒ erro retornado, lote não sai.

### 2.4 Tempo real e consistência
- Mapa de leitos, painel de farmácia, painel de chamada e mapa de salas cirúrgicas usam **WebSocket (Socket.IO)** com namespaces por hospital.
- Eventos de domínio publicados em **Redis Streams** (escolhido sobre RabbitMQ pelo binômio simplicidade-performance + reaproveitamento da infra Bull).
- Consistência forte (transacional) dentro do *bounded context*; eventual entre contextos (saga via outbox pattern).

### 2.5 Qualidade
- Cobertura de testes mínima: **80% unitário**, **70% integração** nos módulos clínico-financeiros.
- Lint: ESLint + Prettier (ver `.eslintrc.cjs`).
- Tipos: **TypeScript strict**. `any` é proibido em código de produção (use `unknown` + narrowing).
- PRs sem teste de regressão são rejeitados.

---

## 3. Stack canônica

> Detalhamento e justificativas no `STACK.md`. Aqui está só o "o que".

| Camada | Tecnologia | Versão |
|---|---|---|
| Backend (núcleo) | **NestJS + TypeScript** | Node 20 LTS, NestJS 10+ |
| Backend (IA isolada) | Python + FastAPI | Python 3.12 |
| ORM | **Prisma** (preferido) ou TypeORM | última estável |
| Banco | **PostgreSQL 16** | + extensões `pgcrypto`, `uuid-ossp`, `pg_trgm`, `btree_gin` |
| Cache / Filas | **Redis 7** + BullMQ | — |
| Frontend Web | React 18 + TypeScript + Vite + Tailwind + shadcn/ui | — |
| Mobile (paciente) | React Native | — |
| PEP Editor | TipTap (ProseMirror) | — |
| Mapa de leitos | SVG + react-flow ou Konva | — |
| Agenda | FullCalendar | — |
| Tempo real | Socket.IO | — |
| TISS XML | xmlbuilder2 + xsd-schema-validator | — |
| PDF | Puppeteer (laudos, guias) + PDFKit (espelhos rápidos) | — |
| Assinatura | ICP-Brasil (lib-cades) + TOTVS Assinatura Eletrônica | — |
| Teleconsulta | Daily.co (preferida) ou Jitsi self-hosted | — |
| Observabilidade | OpenTelemetry → Grafana/Tempo/Loki | — |
| CI/CD | GitHub Actions + Docker + Helm | — |

**Linguagens proibidas no núcleo:** PHP, Ruby, Java (já existem fornecedores TOTVS nesse stack — HMS-BR é a alternativa moderna). **Go**: reservado para microsserviço futuro (XML TISS em escala) — ver `STACK.md` §6.

---

## 4. Estrutura de diretórios canônica

```
hms-br/
├── apps/
│   ├── api/                  # NestJS (núcleo)
│   ├── web/                  # React (admin + clínico)
│   ├── portal-paciente/      # React (portal)
│   ├── portal-medico/        # React (portal)
│   ├── mobile/               # React Native
│   └── ai-service/           # FastAPI (OCR/NLP)
├── packages/
│   ├── shared-types/         # DTOs/interfaces compartilhados (TS)
│   ├── tiss/                 # Lib geração/validação TISS XML
│   ├── sus/                  # Lib BPA/AIH/APAC
│   ├── domain/               # Entidades de domínio puras (sem framework)
│   └── ui-kit/               # shadcn extensions
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/                     # Docs de cada um dos 9 itens
├── skills/                   # SKILL.md por módulo (este projeto)
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
├── CLAUDE.md
├── SPEC.md
├── PRD.md
├── DB.md
├── STACK.md
└── ARCHITECTURE.md
```

NestJS internamente segue **arquitetura modular por bounded context** (hexagonal):

```
apps/api/src/
├── modules/
│   ├── pacientes/
│   │   ├── domain/         # entidades, value objects, eventos
│   │   ├── application/    # use cases, DTOs, ports
│   │   ├── infrastructure/ # repositórios Prisma, controllers HTTP, gateways WS
│   │   └── pacientes.module.ts
│   ├── pep/
│   ├── faturamento/
│   ├── farmacia/
│   ├── centro-cirurgico/
│   ├── leitos/
│   ├── glosas/
│   ├── repasse/
│   ├── ccih/
│   ├── cme/
│   ├── same/
│   └── ...
├── shared/
│   ├── auth/
│   ├── audit/
│   ├── lgpd/
│   ├── tiss/
│   └── persistence/
└── main.ts
```

---

## 5. Convenções de código (TypeScript/NestJS)

- **Idioma**: nomes de classes/funções/arquivos em **inglês**. Exceção: termos do domínio TISS/SUS sem tradução cabível (ex.: `Glosa`, `Repasse`, `CarteirinhaConvenio` permanecem em português).
- **Nomes de tabelas e colunas**: **português** (compatibilidade com TISS/SUS, leitura por analistas de faturamento).
- **DTOs** sempre validados com `class-validator` + `class-transformer`. Nada chega ao service sem validação.
- **Use cases** = uma classe = uma responsabilidade. `CreatePatientUseCase`, `IssuePrescriptionUseCase`, `CloseAccountUseCase`.
- **Repositórios** retornam **entidades de domínio**, nunca modelos Prisma crus para fora da camada de infra.
- **Controllers** finos: validação → use case → DTO de resposta. Sem regra de negócio.
- **Eventos de domínio** publicados via `EventEmitter2` interno e replicados em **Redis Streams** quando cruzam contexto.
- **Errors**: hierarquia única — `DomainError` (esperado, vira HTTP 4xx) vs `InfrastructureError` (inesperado, vira 5xx + alerta).
- **Logs**: `pino` estruturado JSON. **Sem PHI**. Use `correlation-id` (middleware obrigatório).
- Sem `console.log` em produção. ESLint quebra o build se aparecer.

---

## 6. Convenções de banco

> Regras curtas — detalhamento no `DB.md`.

- Snake_case sempre: tabelas (`pacientes`, `contas_itens`), colunas (`data_nascimento`).
- Toda tabela tem: `id BIGSERIAL PK`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ`, `created_by BIGINT`, `updated_by BIGINT`, `deleted_at TIMESTAMPTZ` (soft-delete).
- Tabelas multi-tenant têm `tenant_id BIGINT NOT NULL` indexado e em **toda PK composta lógica**.
- FKs sempre nomeadas: `fk_<tabela>_<campo>`. Índices: `ix_<tabela>_<campos>`. Unique: `uq_<tabela>_<campos>`.
- ENUMs do domínio são **tipos PostgreSQL** (`CREATE TYPE`), não `VARCHAR + CHECK`.
- Particionamento por data nas três grandes (`evolucoes`, `prescricoes`, `dispensacoes`) — particionamento *range mensal*. Detalhes no `DB.md` §9.
- Auditoria: trigger genérica `tg_audit` em todas as tabelas clínicas → escreve em `auditoria_eventos` (JSONB diff).
- Migrations Prisma versionadas. **Nunca editar migration aplicada** — sempre nova migration.

---

## 7. Pipeline TISS (atenção redobrada)

A geração de XML TISS é **a parte mais frágil** do sistema. Regras:

1. Toda guia gerada passa por **validação XSD da versão TISS aplicável** antes de persistir como `GERADA`.
2. Cada conta sabe a **versão TISS** do convênio no momento do faturamento (snapshot — convênio pode evoluir TISS, contas antigas mantêm versão).
3. Lotes são **imutáveis após envio**. Reenvio gera novo lote com referência ao anterior.
4. Falha de validação retorna **erro estruturado por campo** que o operador entenda (ex.: "Campo `dataAtendimento` da guia 123 inconsistente com `dataAlta`").
5. **Hash SHA-256** do XML armazenado para auditoria (provar que o XML enviado é exatamente aquele que a operadora recebeu).

Detalhes em `docs/05-apis-rest.md` §TISS e `skills/08-faturamento/SKILL.md`.

---

## 8. Política de testes

| Camada | O que testar | Ferramenta | Cobertura mínima |
|---|---|---|---|
| Domain | Entidades, value objects, regras puras | Vitest | 95% |
| Application (use cases) | Fluxos com mocks de repositórios | Vitest | 90% |
| Infrastructure | Repos Prisma, gateways HTTP | Vitest + testcontainers (Postgres real) | 70% |
| HTTP (E2E) | Endpoints críticos do TISS, faturamento, prescrição | Supertest | 100% dos críticos |
| Frontend | Componentes do PEP e mapa de leitos | Vitest + Testing Library | 80% |

**Testes obrigatórios sem exceção** (nenhum PR passa sem eles):

- Geração de cada guia TISS (SP/SADT, Internação, Honorários, Outras Despesas, Resumo) com fixture validando contra XSD.
- Cálculo de repasse com cada `tipo_base_calculo` × `momento_repasse`.
- Apuração de glosa com recurso parcial.
- Conversão de unidades (prescrição → dispensação → faturamento).
- Alocação de leito com colisão simulada (race condition).
- Soft-delete + audit log em prescrição clínica.

---

## 9. O que NÃO fazer

- ❌ Não usar `float`/`number` para dinheiro.
- ❌ Não armazenar senhas em hash que não seja Argon2id.
- ❌ Não logar CPF, CNS, conteúdo de evolução, prescrição ou laudo.
- ❌ Não criar endpoint que retorne dados de paciente sem `tenant_id` no token e sem checagem de RBAC.
- ❌ Não fazer `DELETE` físico em qualquer tabela clínica.
- ❌ Não gerar XML TISS sem validar XSD.
- ❌ Não aceitar prescrição sem checagem de alergia/interação/dose (a checagem pode ser bypassada com justificativa, **nunca silenciosamente**).
- ❌ Não fazer "n+1" em telas críticas (PEP, mapa de leitos, painel farmácia). Sempre `include`/`select` explícito.
- ❌ Não introduzir nova lib sem registrar no `STACK.md` e justificar.
- ❌ Não criar tabela sem ler o `DB.md` primeiro — pode já existir.

---

## 10. Plano de fases (resumo executivo — completo em `docs/08-instrucoes-claude-code.md`)

| Fase | Escopo | Entregável |
|---|---|---|
| **0** | Fundação: monorepo, CI/CD, auth, RBAC, multi-tenancy, observabilidade | Esqueleto rodando |
| **1** | Cadastros gerais (pacientes, prestadores, convênios, procedimentos, setores, leitos) | CRUDs com auditoria |
| **2** | Agendamento + Recepção + Triagem | Agenda + check-in funcional |
| **3** | PEP (evoluções, prescrições, exames, atestados, assinatura) | Médico opera no PEP |
| **4** | Internação + Mapa de Leitos (WebSocket) | Mapa em tempo real |
| **5** | Farmácia (dispensação, farmácia clínica, controlados) | Painel funcional |
| **6** | Centro Cirúrgico (agenda, kits, gabaritos, OPME, ficha) | Cirurgias completas |
| **7** | Laboratório + Imagem + Central de Laudos | Laudo web assinado |
| **8** | Faturamento (TISS XML + SUS BPA/AIH + Particular + Pacotes) | Lotes válidos enviados |
| **9** | Glosas + Repasse Médico (apuração + folha + liberação) | Ciclo financeiro |
| **10** | CME + CCIH + Indicadores (BI) | Compliance + dashboards |
| **11** | SAME + Visitantes + Custos | Periféricos |
| **12** | Portais (Médico/Paciente) + Mobile + Teleconsulta | Self-service |
| **13** | Integrações (RM, IA, Anestech, labs externos) | Ecossistema |

Fases podem ser paralelizadas após Fase 1 — múltiplos agentes do Claude Code podem atuar em módulos diferentes desde que respeitem fronteiras de contexto.

---

## 11. Como o agente deve se comportar

- **Sempre** ler a SKILL do módulo antes de codar.
- **Sempre** consultar `DB.md` antes de criar/alterar tabela.
- **Sempre** rodar `pnpm test` no escopo modificado antes de abrir PR.
- **Sempre** atualizar `DB.md`/docs quando alterar schema/contrato — *docs as source of truth*.
- **Quando em dúvida sobre regra de negócio**: ler `docs/03-regras-negocio.md` (RN-XXX-NN). Se ainda houver dúvida, *parar e perguntar* ao humano. **Não inventar regra de faturamento, repasse ou TISS.**
- Ao tocar em código de outro módulo, **respeitar a fronteira**: comunicar via use case público, evento ou API, nunca via import direto de classe interna.
- Evitar refatorações largas em PRs de feature. Refator vai em PR próprio.
- Commits em **Conventional Commits** (`feat(pep):`, `fix(faturamento):`, `chore(infra):`).

---

## 12. Glossário rápido

Para o glossário completo, ver `docs/09-glossario.md`. Termos que **todo agente** deve conhecer:

PEP, TISS, TUSS, CBHPM, SUS, BPA, AIH, APAC, ANS, **Glosa**, **Repasse**, **OPME**, CME, CCIH, SAME, **Grupo de Gasto**, **Elaboração de Contas**, **Caderno de Gabaritos**, **Elegibilidade**, **Classificação de Risco** (Manchester), **Dispensação**, **Farmácia Clínica**, CID-10.

---

## 13. Contato e dúvidas

Em caso de ambiguidade ou requisito conflitante:
1. Verifique a precedência de documentos (§0).
2. Procure a RN correspondente em `docs/03-regras-negocio.md`.
3. Se persistir, **abra uma issue** com label `question` e *aguarde* — **nunca decida sozinho** em regra clínica ou financeira.

---

> *"No domínio hospitalar, código que falha em silêncio fere pacientes. Código que ignora regras de faturamento quebra o hospital. Aqui, ergonomia é importante; correção é inegociável."*
