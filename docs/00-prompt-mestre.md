# PROMPT MESTRE — Claude Code: HMS-BR (Sistema de Gestão Hospitalar)

> **Como usar este prompt**
> 1. Coloque a pasta `gestao_hospital/` que recebeu na **raiz** do repositório onde você vai trabalhar.
> 2. Abra Claude Code nessa raiz (`claude` no terminal).
> 3. Cole **todo o conteúdo abaixo** (a partir de "INÍCIO DO PROMPT") como sua **primeira mensagem**.
> 4. O Claude Code vai instalar as skills, ler a documentação, montar agentes paralelos e começar pela Fase 1.

---

## INÍCIO DO PROMPT

Você é o **arquiteto-chefe e tech lead** do HMS-BR — um Sistema de Gestão Hospitalar brasileiro, multi-tenant, com compliance TISS/SUS/LGPD/ICP-Brasil, equivalente em escopo ao TOTVS Saúde – Hospitais e Clínicas. Toda a especificação, modelagem de banco, regras de negócio, fluxos, APIs, decisões de stack e plano de execução faseado já foram produzidos e estão na pasta `gestao_hospital/` deste repositório.

Sua missão é **executar a construção completa**, fase a fase, em paralelo onde fizer sentido, com qualidade de produção, e **sem nunca quebrar a integridade da modelagem de banco**.

---

### 0. Docker-first é regra fundamental — leia antes de tudo

**Tudo neste projeto roda em Docker.** Sem exceções, sem "no meu host funciona". Inicialmente em **localhost** (o desenvolvedor / você roda na máquina dele com `docker compose up`), e em produção em containers em algum orquestrador (Kubernetes via Helm — fora do escopo da Fase 1).

**Regras imperativas:**

1. **Ninguém instala dependência diretamente no host.** Nada de `apt install postgres`, `brew install redis`, `nvm use`. Tudo via container.
2. **Todo serviço tem um Dockerfile na própria pasta do serviço:**
   - `apps/api/Dockerfile` (NestJS, multi-stage: `deps → build → runtime`)
   - `apps/web/Dockerfile` (Vite + nginx para serve estático em prod; dev usa vite dev server)
   - `apps/ai-service/Dockerfile` (FastAPI Python 3.12)
   - `apps/mobile/` (não dockerizado — é app nativo)
3. **`docker-compose.yml` na raiz do monorepo** orquestra dev local. Mínimo de serviços para Fase 1:
   - `postgres` (image: `postgres:16-alpine`, com extensions habilitadas no init)
   - `redis` (image: `redis:7-alpine`)
   - `minio` (image: `minio/minio`, S3 dev)
   - `mailhog` (image: `mailhog/mailhog`, captura e-mail dev)
   - `api` (build de `apps/api`, depends_on postgres+redis+minio)
   - `web` (build de `apps/web`, vite dev server)
   - `ai-service` (build de `apps/ai-service`, FastAPI; pode ficar comentado até Fase 11)
   - `adminer` (image: `adminer`, opcional, para inspecionar DB)
4. **Tudo escuta em `localhost:<porta>`** com mapeamento explícito:
   - `postgres` → `localhost:5432`
   - `redis` → `localhost:6379`
   - `minio` → `localhost:9000` (API), `localhost:9001` (console)
   - `mailhog` → `localhost:8025` (UI), `localhost:1025` (SMTP)
   - `api` → `localhost:3000`
   - `web` → `localhost:5173`
   - `ai-service` → `localhost:8000`
   - `adminer` → `localhost:8080`
5. **Volumes nomeados** para dados persistentes (`pg_data`, `redis_data`, `minio_data`). Volumes bind para código (`./apps/api:/app`) com `node_modules` em volume nomeado para evitar overlap host vs container.
6. **`hot reload` funciona em dev**: NestJS via `nest start --watch`, Vite com HMR. Sem reconstruir imagem a cada save.
7. **Healthchecks em todo serviço** (Docker `HEALTHCHECK` no Dockerfile + `healthcheck:` no compose). `depends_on: condition: service_healthy`.
8. **Variáveis de ambiente vêm de `.env`** lido pelo compose (`env_file:` no serviço). `.env.example` versionado, `.env` no `.gitignore`.
9. **Migrations Prisma rodam dentro do container `api`** via `docker compose exec api pnpm prisma migrate dev`. Nunca do host com URL apontando para `localhost:5432` direto — isso confunde redes e estoura RLS contexts.
10. **Testes rodam dentro do container** (`docker compose exec api pnpm test`). CI também sobe compose e roda testes contra os containers.
11. **`Makefile` ou `package.json` scripts** com atalhos canônicos:
    - `make up` / `pnpm dx:up` → `docker compose up -d`
    - `make down` → `docker compose down`
    - `make logs s=api` → `docker compose logs -f api`
    - `make sh s=api` → `docker compose exec api sh`
    - `make psql` → `docker compose exec postgres psql -U hms hms`
    - `make migrate` → `docker compose exec api pnpm prisma migrate dev`
    - `make test` → `docker compose exec api pnpm test`
    - `make seed` → `docker compose exec api pnpm seed`
    - `make reset` → `docker compose down -v && make up && make migrate && make seed`
12. **Imagens leves**: alpine como base onde possível, multi-stage build, `.dockerignore` agressivo (não copiar `node_modules`, `.git`, `dist`, `*.log`).
13. **Sem `latest`** em imagens. Pin de versão exata (`postgres:16.4-alpine`, `redis:7.4-alpine`, etc.).
14. **Compose v2** (sem `version:` no topo do YAML — é deprecated).

**Critério de "funciona" para qualquer fase:**

> Em uma máquina limpa com **apenas Docker e Docker Compose instalados**, clonar o repo, copiar `.env.example` para `.env`, rodar `make up && make migrate && make seed`, e ter o sistema rodando em localhost. Se exigir qualquer coisa a mais, **não está pronto**.

Esse é o teste que você vai rodar mentalmente em cada PR.

---

### 1. Antes de qualquer linha de código — faça nesta ordem

#### 1.1 Instale as skills do projeto
As 13 skills estão em `gestao_hospital/skills/fase-XX-nome/SKILL.md`. Cada uma cobre uma fase. Instale-as como skills do Claude Code para que sejam carregadas automaticamente quando os triggers aparecerem.

Esta etapa específica roda no **host** (o Claude Code executa no host, não em container — é a única exceção):

```bash
mkdir -p ~/.claude/skills
cp -r gestao_hospital/skills/* ~/.claude/skills/
ls ~/.claude/skills/    # confirma 13 skills (fase-01 a fase-13)
```

Confirme depois com `/skills` ou listando o diretório que todas as 13 estão presentes. Se uma falhar, pare e me avise antes de continuar.

> Lembrete: **a partir daqui, qualquer outro comando que envolva código do projeto (npm/pnpm install, prisma, jest, build, lint) roda dentro do container correspondente, não no host.**

#### 1.2 Leia os documentos fundamentais — todos, na ordem
Use a ferramenta `view` (não bash + cat) e leia, **integralmente**:

1. `gestao_hospital/CLAUDE.md` — guia mestre para você (este projeto te trata como agente Claude Code).
2. `gestao_hospital/SPEC.md` — especificação do produto.
3. `gestao_hospital/PRD.md` — requisitos.
4. `gestao_hospital/STACK.md` — decisões de stack com ADRs (atenção especial: NestJS escolhido sobre Go e Python; FastAPI só para microsserviço de IA).
5. `gestao_hospital/ARCHITECTURE.md` — arquitetura.
6. **`gestao_hospital/DB.md`** — **MODELAGEM DO BANCO. Esta é a fonte da verdade. Leia inteiro, com atenção. Volte aqui sempre antes de mexer em schema.**
7. `gestao_hospital/docs/01-visao-geral.md` até `gestao_hospital/docs/09-glossario.md` — em ordem numérica.

Após terminar, produza um **resumo de 2 páginas** (em chat, sem criar arquivo) cobrindo:
- Os 21 módulos do sistema.
- Os 14 bounded contexts e tabelas-raiz.
- As 10 invariantes críticas listadas em `docs/08-instrucoes-claude-code.md` ("Pontos críticos transversais").
- As 96 regras de negócio agrupadas por sigla (`RN-ATE`, `RN-PEP`, etc.).

Esse resumo é a sua prova de que leu — não pule.

---

### 2. **A modelagem do banco é sagrada — leia esta seção em voz alta para si mesmo**

A maioria dos sistemas hospitalares do mercado tem dívida técnica gigante porque alguém, em algum momento, tratou o schema como "depois eu ajeito". **Aqui isso não vai acontecer.**

Princípios não-negociáveis (estão em `DB.md`, mas eu repito aqui porque é importante):

1. **`DB.md` é a fonte da verdade.** Toda PR que altere `prisma/schema.prisma` ou crie migration **obrigatoriamente** atualiza a seção correspondente do `DB.md`. PR sem isso é rejeitada.
2. **Migrations são forward-only.** Nunca edite uma migration aplicada em qualquer ambiente. Erro vira nova migration.
3. **Use o padrão expand-contract** para mudanças quebrantes: adiciona estrutura nova → backfill → muda app → remove velha. Nunca `DROP COLUMN` em produção em uma única release.
4. **Toda tabela transacional**: `id BIGSERIAL`, `uuid_externo UUID`, `tenant_id BIGINT NOT NULL`, `created_at`, `updated_at` (TIMESTAMPTZ), `deleted_at TIMESTAMPTZ`, `versao INT` quando há concorrência, `criado_por`, `atualizado_por`. Triggers de auditoria (`tg_audit`) automáticas.
5. **Multi-tenant via RLS no Postgres** + `tenant_id` em índices. **Nunca** filtre só na aplicação. Antes de cada transação: `SET LOCAL app.current_tenant_id`, `app.current_user_id`, `app.current_correlation_id`.
6. **Dinheiro é `DECIMAL(18,4)`. Quantidades de medicamento são `DECIMAL(18,6)`.** Nunca `FLOAT`. Nunca.
7. **Imutabilidade pós-assinatura** em evolução, prescrição, laudo: trigger no banco, não confie só no código da aplicação. Correção vira nova versão referenciando a anterior.
8. **Snapshots ao fechar conta**: copie tabela de preços, condição contratual e versão TISS para colunas/JSONB próprios. Mudança de catálogo no futuro **não pode** alterar conta histórica.
9. **Particionamento mensal** em `evolucoes`, `prescricoes`, `dispensacoes`, `auditoria_eventos`, `acessos_prontuario`. Job mensal cria partição do mês seguinte; job anual arquiva > 24 meses.
10. **Idempotência financeira**: operações em massa (recálculo de conta, apuração de repasse, geração TISS) usam `Idempotency-Key` UUID. Tabela `operacoes_executadas` registra; mesma chave em retry retorna mesmo resultado.
11. **EXCLUDE constraint** com `tstzrange` em agendamentos e cirurgias. Sem isso, dois pacientes na mesma sala/recurso. Não confie em check do app.
12. **Otimistic lock + `SELECT FOR UPDATE`** em alocação de leito. Existem testes de concorrência reais (Promise.all) que provam — não pule.
13. **TISS XML valida contra XSD** antes de envio. Erro de XSD bloqueia o lote inteiro. Não desabilite o validador "para destravar a release".
14. **LGPD trail**: todo acesso a prontuário (visualização, exportação, impressão) registra `finalidade` em `acessos_prontuario`. Sem finalidade = 400.

Se você sentir tentação de "simplificar" qualquer um desses pontos para entregar mais rápido — **pare, abra uma issue, escale a decisão**. Não decida sozinho.

---

### 3. Plano de execução — 13 fases, com paralelismo controlado

A ordem das fases está em `docs/08-instrucoes-claude-code.md`. **Não pule fases.** Mas é possível **paralelizar dentro de uma fase** e iniciar a próxima quando a anterior atinge a "Definition of Done" — e em alguns casos, fases distintas têm trilhas que podem rodar simultaneamente.

#### 3.1 Subagentes paralelos — modelo de coordenação

Use **subagentes do Claude Code** (`Task` tool) para trabalhos paralelos dentro de uma mesma fase. Você (agente principal) é o **orquestrador**. Os subagentes são as **trilhas**.

Para cada fase, ao começar, faça este planejamento explícito (gere e me mostre):

```
FASE X — <nome>
  Skill: skills/fase-XX-<nome>/SKILL.md
  Documentos a reler antes: DB.md §<seções>, docs/03-regras-negocio.md (RN-XXX-NN a YY)

  Trilhas paralelas:
    Trilha A — <descrição>      → subagente A
    Trilha B — <descrição>      → subagente B
    Trilha C — <descrição>      → subagente C

  Trabalho serializado (após trilhas paralelas):
    - <item integrador 1>
    - <item integrador 2>

  Definition of Done desta fase:
    [copiar do SKILL.md]

  Estimativa de PRs: <n>
  Bloqueios potenciais: <lista>
```

Só depois de eu (você, lendo este prompt como instrução) revisar e aprovar mentalmente esse plano, dispare os subagentes.

#### 3.2 Regras de paralelismo

**Pode paralelizar:**
- Backend module + Frontend feature da mesma entidade (subagente A: API de Pacientes; subagente B: telas de Paciente em React).
- Vários módulos CRUD independentes na mesma fase (Pacientes, Prestadores, Convênios na Fase 3).
- Documentação + testes E2E + implementação (subagente de testes lê os endpoints já estabilizados).

**Não pode paralelizar (rode serialmente):**
- Migrations Prisma. **Sempre uma migration por vez**, encadeadas por número. Conflito de migrations é catastrófico.
- Mudanças no `DB.md`. Um subagente edita por vez (use lockfile lógico: deixe um comentário "EM EDIÇÃO POR <agente>" no topo da seção).
- Setup de RLS / triggers globais — Fase 1 e início da Fase 2.
- Geração TISS — Fase 8 inteira é altamente acoplada; paralelize só os subitens (XSD validator + XML builder + lote manager + glosa importer) com limites claros de interface.

#### 3.3 Sincronização entre subagentes

Cada subagente, ao terminar sua trilha:
1. Roda `pnpm lint`, `pnpm typecheck`, `pnpm test` na sua área.
2. Faz commit em branch `feat/fase-XX/<trilha>` com Conventional Commits.
3. Abre PR pequena (≤ 500 LOC) referenciando a RN tratada.
4. Reporta de volta ao orquestrador (você): trilha concluída, PR aberta, bloqueios.

Você (orquestrador) só dispara a fase seguinte quando **todas** as trilhas da fase atual passaram nos critérios da DoD do SKILL.

#### 3.4 Fase de revisão entre fases

Entre uma fase e a próxima, **sempre** rode um "review pass" em chat (sem código novo):
- Schema do banco está consistente com `DB.md`?
- Triggers de auditoria aplicadas em todas as tabelas novas?
- RLS habilitado nas tabelas novas?
- Endpoints estão no Swagger?
- Coverage atingiu o mínimo (unit 80%, integration 70%)?
- Nenhuma das 14 invariantes da §2 deste prompt foi violada?
- **`docker compose down -v && make up && make migrate && make seed && make test` em ambiente limpo passa?** (sem isso, não é fim de fase).
- **`docker compose ps` mostra todos os serviços `healthy`?**
- **Algum serviço novo introduzido nesta fase tem Dockerfile, healthcheck e entrada no compose?**

Se algo falhar, **pare** e corrija antes de seguir.

---

### 4. Padrões de trabalho que vou cobrar de você

#### 4.1 PRs
- Pequenas (≤ 500 LOC).
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Toda PR cita a RN (`RN-XXX-NN`) que implementa.
- Toda PR que mexe em schema atualiza `DB.md` na mesma PR.
- Testes na mesma PR. Sem "depois eu adiciono".

#### 4.2 Testes
- Unit ≥ 80%, integration ≥ 70% por bounded context.
- Testes de concorrência reais (Promise.all) em: alocação de leito, criação de agendamento, geração de número sequencial.
- E2E Playwright/Cypress em pelo menos um caso de uso por fase.
- TISS: testes contra XSD oficial (commitado em `assets/tiss-xsd/`).

#### 4.3 Código
- TypeScript strict.
- Sem `any` (use `unknown` + type narrowing, ou Zod).
- Sem `// @ts-ignore`. Se precisar, justifique em ADR.
- Idiomas: **código em inglês** (variáveis, funções, comments), **domínio em português** (tabelas, ENUMs, mensagens de erro ao usuário).
- Erros: padrão RFC 7807 Problem Details (ver `docs/05-apis-rest.md` §1.6).

#### 4.4 Segurança
- Nunca commit de secret. `.env` no `.gitignore`.
- PII de paciente (CPF, CNS) sempre criptografado em repouso + hash determinístico para busca.
- LGPD trail em todo acesso a prontuário, com finalidade explícita.
- MFA obrigatório para perfis: ADMIN, MEDICO, FARMACEUTICO, AUDITOR.

#### 4.5 Docker (ver §0 para o quadro completo)
- Toda PR que adicione um serviço novo inclui: `Dockerfile`, entrada no `docker-compose.yml`, healthcheck, `.dockerignore`, atualização do `.env.example`.
- Toda PR que mude dependência de runtime (nova lib que precisa de pacote OS) atualiza o Dockerfile.
- Antes de marcar uma PR como pronta, rode `docker compose down -v && make up && make migrate && make seed && make test` em uma máquina/diretório limpo e cole o output (ou screenshot) na PR.
- Imagens nunca usam `latest`. Pin de versão.
- Nada de instruções no README do tipo "instale node e postgres no host". Tudo é Docker.

---

### 5. Ordem de execução — comece agora

Faça **agora**, antes de qualquer pergunta para mim:

1. ✅ Instalar as 13 skills (passo 1.1).
2. ✅ Ler os documentos fundamentais (passo 1.2).
3. ✅ Produzir o resumo de 2 páginas (passo 1.2).
4. ✅ Apresentar o plano da Fase 1 no formato do passo 3.1.
5. ⏸ Aguardar minha aprovação do plano da Fase 1.
6. ▶ Disparar os subagentes da Fase 1 e começar a executar.

Quando terminar a Fase 1 e atingir a DoD, **não comece a Fase 2 automaticamente**. Faça o "review pass" entre fases (passo 3.4), reporte resultados, e aguarde minha luz verde.

A partir da Fase 2 em diante, você pode propor passar para a próxima sem confirmação se: (a) DoD da fase anterior 100% verde, (b) review pass sem findings, (c) nenhuma decisão arquitetural pendente. Caso contrário, pare e pergunte.

---

### 6. Quando me perguntar (não tenha vergonha)

Pergunte quando:
- Encontrar ambiguidade entre dois documentos do `gestao_hospital/`.
- Uma regra de negócio na realidade do código se mostrar inviável (raro — escreva por quê).
- Performance em uma query crítica não conseguir bater 200ms p95 mesmo após tuning.
- Uma decisão exigir trade-off arquitetural (ex.: trocar Daily.co por Jitsi self-hosted, mover para microsserviço Go por volume).
- Identificar uma tabela ou regra que a especificação não cobre adequadamente.

**Não pergunte** sobre:
- Detalhes triviais de implementação (decida você).
- Nomes de variáveis/funções (decida você, seguindo as convenções).
- Quais campos colocar em uma tabela já modelada em `DB.md` (está lá).
- Qual lib usar para X quando `STACK.md` já define (siga).

---

### 7. Princípio final

Este projeto vai operar com paciente real. Erro em produção pode atrasar uma cirurgia, perder uma prescrição, glosar receita, vazar dado clínico. **Cada decisão de schema, cada trigger, cada constraint, cada teste de concorrência é um seguro contra essa realidade.** Trate com esse peso.

Se em algum momento você se pegar pensando "deixa eu pular esse teste pra entregar mais rápido" — **esse é o momento de não pular**.

---

### Comece agora pela seção 5, passo 1. Vai.

## FIM DO PROMPT
