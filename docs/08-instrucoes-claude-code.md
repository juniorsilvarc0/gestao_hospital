# 08 — Instruções para Claude Code (Plano de Execução)

> Sequência ordenada das fases de implementação para os agentes Claude Code.
> **Ordem importa**: cada fase depende das anteriores. Não pular.
> **Ler antes de cada fase**: `CLAUDE.md` (raiz) + `DB.md` + skill da fase em `skills/`.

---

## Princípios operacionais

1. **Pequenos PRs.** Limite ~500 LOC por PR. PRs grandes são bloqueados na revisão.
2. **Testes na mesma PR.** Coverage mínima por contexto: unit 80%, integration 70%.
3. **Migrations forward-only.** Nunca editar uma migration aplicada em qualquer ambiente. Erros viram nova migration.
4. **Atualizar `DB.md` em todo PR que mexa em schema.** Sem isso, PR não aprovado.
5. **Lint + format obrigatórios.** ESLint + Prettier no CI bloqueante.
6. **Commits seguem Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
7. **Cada PR referencia uma RN** (`docs/03-regras-negocio.md`) ou uma issue/feature.
8. **Branch protection** em `main`: 2 reviews + CI verde.
9. **Não inventar dados de catálogo.** TUSS, CBHPM, CID, CBO vêm de fontes oficiais.
10. **Nunca commitar segredos.** `.env` no `.gitignore`. Use `dotenv-vault` ou KMS.

---

## Fases (13 fases)

### Fase 1 — Fundação

**Objetivos:**
- Repositório monorepo (turborepo ou nx).
- Estrutura: `apps/api`, `apps/web`, `apps/ai-service`, `packages/tiss`, `packages/sus`, `packages/domain`, `packages/shared-types`.
- Docker compose para dev (postgres, redis, minio).
- CI básico (GitHub Actions): lint + test + build.
- `.env.example` completo.
- Skeleton NestJS (módulos vazios para os 21 contextos).
- Prisma com schema mínimo (apenas `tenants`, `usuarios`, `perfis`).
- Migrations iniciais.
- README do projeto.

**Saída esperada:** `docker compose up` levanta tudo. `npm run dev` na api e na web roda. Login com seed admin funciona.

**Skill:** `skills/fase-01-fundacao/SKILL.md`.

---

### Fase 2 — Identidade e Acesso

**Objetivos:**
- Auth completo: login, MFA TOTP, refresh rotativo, logout, lockout (RN-SEG-01 a 08).
- Argon2id.
- RBAC: perfis, permissões, atribuição.
- ABAC base (filtros por setor para médicos).
- Multi-tenant com RLS habilitado.
- Sessões em Redis.
- Endpoints: `/auth/*`, `/users/*`, `/users/me`.
- Frontend: telas de login + setup MFA + troca de senha.
- 2FA mandatório para perfis críticos.

**Skill:** `skills/fase-02-identidade/SKILL.md`.

---

### Fase 3 — Cadastros Gerais

**Objetivos:**
- CRUD de: pacientes, prestadores, convênios, planos, condições contratuais, tabelas de procedimentos, tabelas de preços, unidades, setores, leitos, salas.
- Importação de TUSS, CBHPM, CID-10, CBO 2002.
- Busca otimizada (trigram em nomes).
- LGPD: criptografia de CPF/CNS, consentimento.
- Frontend: telas de cadastro.

**Skill:** `skills/fase-03-cadastros/SKILL.md`.

---

### Fase 4 — Agendamento

**Objetivos:**
- Recursos (médico, sala, equipamento), disponibilidade, bloqueios.
- CRUD de agendamentos com constraint EXCLUDE (sem overbooking).
- Encaixe.
- Confirmação 24h (job BullMQ).
- Painel de chamada (WebSocket).
- Auto-agendamento via portal paciente.
- Frontend: agenda (FullCalendar), modal de criação.

**Skill:** `skills/fase-04-agendamento/SKILL.md`.

---

### Fase 5 — Recepção, Atendimento, Triagem

**Objetivos:**
- Início de atendimento (consulta elegibilidade, autorização).
- Triagem Manchester.
- Fila de atendimento ordenada.
- Mapa de leitos com WebSocket.
- Alocação de leito com otimistic lock.
- Frontend: recepção, mapa de leitos, painel de chamada.

**Skill:** `skills/fase-05-recepcao-atendimento/SKILL.md`.

---

### Fase 6 — PEP (Prontuário Eletrônico)

**Objetivos:**
- Evoluções multiprofissionais (médica, enfermagem, fisio, etc.).
- Prescrições + análise farmacêutica.
- Solicitações de exame + resultados/laudos.
- Documentos: atestado, receita, declaração, resumo de alta.
- Sinais vitais com validação fisiológica.
- Assinatura digital ICP-Brasil.
- Imutabilidade pós-assinatura (trigger).
- Editor TipTap com macros.
- Validação pré-prescrição (alergia, interação, dose máxima).
- Particionamento mensal de evoluções/prescrições.

**Skill:** `skills/fase-06-pep/SKILL.md`.

---

### Fase 7 — Farmácia e Centro Cirúrgico

**Objetivos:**
- Farmácia: análise farmacêutica, dispensação por turno, devolução, conversão de unidades, controlados (livro), painel WebSocket.
- Centro Cirúrgico: agendamento de cirurgia (constraint EXCLUDE), kits, gabaritos, fichas, OPME, equipe, ficha anestésica.
- Geração automática de itens em conta.

**Skill:** `skills/fase-07-farmacia-cirurgico/SKILL.md`.

---

### Fase 8 — Faturamento, TISS, Glosas

**Objetivos:**
- Conta com lifecycle (ABERTA → FECHADA → FATURADA → ...).
- Snapshots ao fechar (versão TISS, tabela de preços, condição contratual).
- Elaboração de contas com identificação de inconsistências.
- Geração de XML TISS (validação XSD obrigatória).
- Lotes TISS.
- Recebimento de retorno (eletrônico ou manual).
- Glosas: importação, recurso, ciclo completo.
- Pacotes (cobrança fechada).
- SUS (BPA, AIH, APAC) — escopo mínimo, expandido em fase futura.

**Skill:** `skills/fase-08-faturamento-tiss-glosas/SKILL.md`.

---

### Fase 9 — Repasse Médico

**Objetivos:**
- Critérios versionados.
- Apuração mensal por competência (job BullMQ).
- Folha de produção por prestador.
- Conferência → Liberação → Pagamento.
- Reapuração após reversão de glosa.
- Snapshot do critério aplicado em cada item.

**Skill:** `skills/fase-09-repasse/SKILL.md`.

---

### Fase 10 — CME, CCIH, SAME, Visitantes

**Objetivos:**
- CME: lotes, etapas, indicadores, rastreabilidade.
- CCIH: casos de IRAS, antibiograma, painel epidemiológico.
- SAME: prontuário físico, empréstimo, digitalização.
- Visitantes: cadastro, restrições, controle de entrada/saída.

**Skill:** `skills/fase-10-cme-ccih-same-visitantes/SKILL.md`.

---

### Fase 11 — Portais e Integrações

**Objetivos:**
- Portal Médico: agenda, laudos pendentes, produção, repasse.
- Portal Paciente: agendamento, exames, receitas, teleconsulta, faturas, LGPD.
- Teleconsulta (Daily.co primeiro).
- Webhooks de retorno (TISS, lab, financeiro).
- Integração com RM/Backoffice (financeiro, contábil).
- Microsserviço IA (FastAPI): OCR de documentos na admissão (DTA Vision).

**Skill:** `skills/fase-11-portais-integracoes/SKILL.md`.

---

### Fase 12 — BI, Dashboards, Indicadores

**Objetivos:**
- Dashboard executivo (KPIs).
- Dashboard operacional (mapa de leitos, fila de atendimento, salas).
- Indicadores assistenciais (taxa de ocupação, permanência média, mortalidade, infecção hospitalar).
- Indicadores financeiros (faturamento, glosa %, recebimento, repasse).
- Schema `reporting` com views materializadas (refresh diário).
- Export para CSV/Excel.

**Skill:** `skills/fase-12-bi-indicadores/SKILL.md`.

---

### Fase 13 — Hardening, Performance, Go-Live

**Objetivos:**
- Auditoria de segurança (pentest interno + externo).
- Performance: explain analyze nas 50 queries top, índices ajustados, particionamento validado.
- Backup completo + restore testado.
- Disaster recovery: RTO < 4h, RPO < 15min.
- Documentação operacional (runbook).
- Treinamento dos usuários-chave.
- Pilot com 1 setor → expansão.

**Skill:** `skills/fase-13-hardening-golive/SKILL.md`.

---

## Pontos críticos transversais

### Identificados na especificação como **CRÍTICOS**

1. **TISS XML compliance** — validação XSD é não-negociável; bug aqui = lote inteiro rejeitado.
2. **Race conditions em alocação de leito** — otimistic locking + SELECT FOR UPDATE.
3. **Imutabilidade após assinatura** — trigger no banco, não confiar só na aplicação.
4. **Snapshots de regras** — conta fechada não pode quebrar quando catálogo muda.
5. **LGPD trail** — todo acesso a prontuário registrado com finalidade.
6. **Idempotência financeira** — operações em massa com `operacao_id`.
7. **Multi-tenant RLS** — sem vazamento entre hospitais.
8. **Particionamento** — sem isso, evoluções engasgam o banco em 1-2 anos.
9. **Repasse com snapshot do critério** — não usar critério atual em apuração retroativa.
10. **Glosa ↔ repasse** — reversão de glosa deve disparar reapuração.

---

## Definition of Done por fase

Uma fase só é considerada **concluída** quando:

- [ ] Todos os endpoints da fase estão implementados e documentados (Swagger).
- [ ] Coverage mínima atingida (unit 80%, integration 70%).
- [ ] Frontend correspondente está navegável.
- [ ] DB.md atualizado.
- [ ] Migrations aplicadas em dev + staging.
- [ ] Smoke tests passando em staging.
- [ ] Pelo menos um caso de uso end-to-end (e2e Playwright/Cypress).
- [ ] Revisão de segurança (Snyk, npm audit, OWASP top 10).
- [ ] Performance: queries críticas < 200ms p95.
- [ ] Sem `TODO`/`FIXME` críticos abertos.
- [ ] Documentação atualizada (CLAUDE.md, docs/, ADR se aplicável).

---

## Quando algo fugir do planejado

- **Bloqueio técnico**: abrir issue + escalar para tech lead.
- **Mudança de regra de negócio**: PR adicionando RN nova ou modificando + atualizar `docs/03-regras-negocio.md`.
- **Necessidade de break the rules** (ex.: scope creep): documentar em ADR e justificar.
