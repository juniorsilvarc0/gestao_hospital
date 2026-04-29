# 02 — Modelo de Dados (Resumo)

> Resumo executivo do modelo de dados. **Para detalhe completo (DDL, índices, constraints, particionamento), ver `DB.md` — fonte da verdade.**

---

## 1. Princípios em uma página

| Princípio | Aplicação |
|---|---|
| **Português + TISS** | Tabelas em `snake_case` português (`pacientes`, `convenios`). Códigos TISS preservados (`codigo_tuss`). |
| **Multi-tenant por linha** | Toda tabela tem `tenant_id BIGINT NOT NULL`. RLS no Postgres reforça. |
| **Soft-delete** | `deleted_at TIMESTAMPTZ` em transacionais. Catálogos usam `ativo BOOLEAN`. |
| **Imutabilidade pós-assinatura** | Evolução, prescrição, laudo: sem UPDATE após `assinada_em`. Correções viram nova versão. |
| **DECIMAL(18,4)** para R$ | Quantidades em `DECIMAL(18,6)`. Nunca `FLOAT` em finanças/medicamentos. |
| **TIMESTAMPTZ + UTC** | Zero ambiguidade de fuso. |
| **JSONB pontual** | PEP (formulários dinâmicos), endereços, contatos, regras de repasse, snapshots. |
| **Snapshots em fechamento** | Conta carrega cópia da tabela de preços, condição contratual e versão TISS vigentes. Mudança de catálogo não reescreve histórico. |
| **Auditoria automática** | Trigger `tg_audit` em todas tabelas clínico-financeiras → `auditoria_eventos`. |
| **Otimistic locking** | Coluna `versao` em tabelas de alta concorrência (atendimentos, leitos, contas). |

---

## 2. Bounded contexts e principais agregados

| Contexto | Agregado raiz | Filhos |
|---|---|---|
| **Identidade** | `usuarios` | sessões, perfis, permissões |
| **Cadastros** | `pacientes`, `prestadores`, `convenios`, `tabelas_procedimentos` | convênios do paciente, especialidades, planos |
| **Estrutura física** | `setores` | leitos, salas cirúrgicas |
| **Agendamento** | `agendamentos` | recursos, disponibilidades, bloqueios |
| **Atendimento + PEP** | `atendimentos` | evoluções, prescrições, solicitações de exame, documentos |
| **Faturamento** | `contas` | itens, glosas, guias TISS, lotes |
| **Repasse** | `repasses` | itens, critérios |
| **Farmácia** | `dispensacoes` | itens, livro de controlados |
| **Centro Cirúrgico** | `cirurgias` | equipe, kits, gabaritos |
| **CME** | `cme_lotes` | artigos, movimentações |
| **CCIH** | `ccih_casos` | (autocontido) |
| **SAME** | `same_prontuarios` | empréstimos |
| **Visitantes** | `visitantes` | visitas |
| **Auditoria/LGPD** | `auditoria_eventos`, `acessos_prontuario` | (transversal) |
| **Infra** | `outbox_events`, `arquivos`, `notificacoes` | (transversal) |

> **Total: ~70 tabelas** core (sem partições).

---

## 3. Diagrama em alto nível

```
                    ┌────────────────┐
                    │    tenants     │
                    └────────┬───────┘
                             │ tenant_id em todas
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌────────────┐      ┌──────────────┐
  │ usuarios │         │ pacientes  │      │ prestadores  │
  └──────────┘         └─────┬──────┘      └──────┬───────┘
                             │                    │
                             ▼                    │
                       ┌────────────┐             │
                       │atendimentos├─────────────┘
                       └────┬───────┘
                            │ (1:1)
       ┌────────────────────┼────────────────────────┐
       ▼                    ▼                        ▼
  ┌──────────┐       ┌─────────────┐         ┌──────────────┐
  │evolucoes │       │ prescricoes │         │   contas     │
  │(particio-│       │ (partic.)   │         │              │
  │ nada)    │       └──────┬──────┘         └──────┬───────┘
  └──────────┘              │                       │
                            ▼                       ▼
                     ┌──────────────┐        ┌─────────────┐
                     │ dispensacoes │        │ contas_itens│
                     │ (partic.)    │        └──────┬──────┘
                     └──────────────┘               │
                                                    ▼
                                            ┌──────────────┐
                                            │ guias_tiss   │
                                            └──────┬───────┘
                                                   │
                                            ┌──────▼───────┐
                                            │  lotes_tiss  │
                                            └──────────────┘
```

---

## 4. Tabelas particionadas (range mensal)

- `evolucoes`
- `prescricoes`
- `dispensacoes`
- `auditoria_eventos`
- `acessos_prontuario`

Job mensal cria partições do mês seguinte e arquiva partições > 24 meses.

---

## 5. Pontos de atenção para o agente

1. **Nunca use `FLOAT` para dinheiro.** Sempre `DECIMAL(18,4)`.
2. **Nunca esqueça `tenant_id`** em uma query. RLS te protege, mas índices precisam.
3. **Antes de fazer UPDATE em evolução/prescrição/laudo**, verifique `assinada_em`. Se não nulo → 409 Conflict.
4. **Sempre filtre `WHERE deleted_at IS NULL`** (Prisma middleware faz, mas raw SQL precisa lembrar).
5. **Snapshots**: ao fechar conta, **copie** preços e regras para colunas/JSONB próprios. Não dependa de joins históricos a catálogos vivos.
6. **Idempotência**: operações financeiras em massa usam `operacao_id UUID`. Antes de executar, verifique `operacoes_executadas`.
7. **Triggers de auditoria preenchem `usuario_id`** lendo `current_setting('app.current_user_id')`. Sempre setar essa variável a cada conexão antes da transação.
8. **Race conditions críticas**: alocação de leito (otimistic lock + `SELECT FOR UPDATE`), agendamento (constraint EXCLUDE).

---

## 6. Onde está o quê

| Pergunta | Documento |
|---|---|
| Qual o DDL da tabela `pacientes`? | `DB.md` §7.2 |
| Quais ENUMs existem? | `DB.md` §4 |
| Como funciona RLS? | `DB.md` §5 |
| Como auditar acesso a prontuário? | `DB.md` §6 |
| Como particionar evoluções? | `DB.md` §9 |
| Quais constraints invariantes? | `DB.md` §10 |
| Estratégia de migration? | `DB.md` §12 |
