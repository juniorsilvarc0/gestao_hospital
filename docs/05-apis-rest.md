# 05 — APIs REST

> Catálogo de endpoints REST do HMS-BR. Convenções, exemplos e tabela completa.
> A especificação OpenAPI (`openapi.yaml`) será gerada automaticamente do código (NestJS Swagger).

---

## 1. Convenções

### 1.1 Versionamento e prefixo

```
/api/v1/<recurso>
```

- Versão major no path (`/v1`).
- Breaking changes → `/v2` (mantém v1 por 6 meses).
- Não-breaking → adiciona campos opcionais, novos endpoints.

### 1.2 Identificação

- Internamente, todas as entidades têm `id` BIGINT.
- **Externamente expõe-se UUID** (`uuid_externo`) — nunca o BIGINT.
- Path: `/api/v1/pacientes/{uuid}`.

### 1.3 Multi-tenant

- Tenant lido do JWT (`tenant_id` claim).
- Endpoints **não** aceitam `tenant_id` em query/body (segurança).
- Operações cross-tenant exigem perfil ADMIN_GLOBAL e endpoint específico em `/api/v1/admin/...`.

### 1.4 Autenticação

```http
Authorization: Bearer <jwt_access_token>
```

- Access token: 15 min.
- Refresh: `POST /api/v1/auth/refresh` com `refresh_token` em corpo.

### 1.5 Padrão de resposta

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-04-28T13:45:00Z"
  }
}
```

Listas:

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 451,
    "total_pages": 23
  }
}
```

### 1.6 Padrão de erro (RFC 7807 Problem Details)

```json
{
  "type": "https://hms-br.dev/errors/conflict",
  "title": "Conflito de leito",
  "status": 409,
  "detail": "O leito 305-A foi alocado para outro paciente entre o select e o update.",
  "instance": "/api/v1/atendimentos/abc/internacao",
  "code": "LEITO_CONFLICT",
  "fields": [
    { "field": "leito_uuid", "message": "leito não disponível" }
  ]
}
```

### 1.7 Códigos HTTP

| Código | Quando |
|---|---|
| 200 | Operação OK com payload |
| 201 | Recurso criado (com `Location`) |
| 202 | Aceito para processamento assíncrono (com `request_id`) |
| 204 | OK sem conteúdo |
| 400 | Erro de validação (corpo inválido) |
| 401 | Não autenticado |
| 403 | Autenticado mas sem permissão |
| 404 | Recurso não existe |
| 409 | Conflito (regra de negócio violada, otimistic lock, sobreposição) |
| 422 | Entidade processável mas semanticamente errada |
| 429 | Rate limit |
| 500 | Erro de servidor |
| 503 | Indisponibilidade temporária |

### 1.8 Idempotência

Operações sensíveis (criação de conta, emissão de TISS, apuração de repasse) aceitam header:

```http
Idempotency-Key: <uuid_v4>
```

Repetir a mesma chave dentro de 24h retorna a resposta original.

### 1.9 Paginação

```
?page=1&page_size=20
```

- `page_size` máximo: 100.
- Listas grandes oferecem cursor (`?cursor=<opaque>`).

### 1.10 Filtros e ordenação

```
?status=ABERTA&convenio_id=abc&sort=-data_fechamento
```

- Prefixo `-` = desc.
- Operadores em filtros avançados:
  - `?data_inicio[gte]=2026-01-01`
  - `?data_fim[lt]=2026-04-01`
  - `?nome[contains]=silva`

### 1.11 Validação

Todo endpoint valida via `class-validator` no DTO. Resposta 400 com lista de campos.

---

## 2. Catálogo de endpoints

> Cobre os ~50 endpoints da especificação. Os de **escrita** geralmente são `POST/PATCH/DELETE`; os de **leitura** são `GET`.

### 2.1 Auth & Users

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/v1/auth/login` | Login (e-mail + senha + MFA) |
| POST | `/api/v1/auth/refresh` | Renova access token |
| POST | `/api/v1/auth/logout` | Invalida refresh token atual |
| POST | `/api/v1/auth/logout-all` | Invalida todos os refresh tokens |
| POST | `/api/v1/auth/mfa/enable` | Habilita MFA TOTP |
| POST | `/api/v1/auth/mfa/verify` | Verifica código TOTP |
| POST | `/api/v1/auth/password/change` | Troca senha |
| POST | `/api/v1/auth/password/forgot` | Solicita reset |
| POST | `/api/v1/auth/password/reset` | Confirma reset com token |
| GET | `/api/v1/users/me` | Dados do usuário logado |
| GET | `/api/v1/users` | Lista usuários (admin) |
| POST | `/api/v1/users` | Cria usuário (admin) |
| PATCH | `/api/v1/users/{uuid}` | Atualiza usuário |
| DELETE | `/api/v1/users/{uuid}` | Soft-delete usuário |
| POST | `/api/v1/users/{uuid}/perfis` | Atribui perfil |

### 2.2 Pacientes e Cadastros

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/pacientes` | Lista paciente com busca |
| POST | `/api/v1/pacientes` | Cria paciente |
| GET | `/api/v1/pacientes/{uuid}` | Detalhe |
| PATCH | `/api/v1/pacientes/{uuid}` | Atualiza |
| DELETE | `/api/v1/pacientes/{uuid}` | Soft-delete |
| GET | `/api/v1/pacientes/{uuid}/convenios` | Convênios vinculados |
| POST | `/api/v1/pacientes/{uuid}/convenios` | Vincula convênio |
| DELETE | `/api/v1/pacientes/{uuid}/convenios/{vinculo_uuid}` | Remove vínculo |
| GET | `/api/v1/pacientes/{uuid}/historico-atendimentos` | Histórico |
| POST | `/api/v1/pacientes/buscar` | Busca avançada (CPF, CNS, nome) |

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/prestadores` | Lista prestadores |
| POST | `/api/v1/prestadores` | Cria |
| PATCH | `/api/v1/prestadores/{uuid}` | Atualiza |
| GET | `/api/v1/prestadores/{uuid}/agenda` | Agenda do prestador |
| GET | `/api/v1/prestadores/{uuid}/folha-producao` | Folha de produção (range de datas) |

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/convenios` | Lista convênios |
| POST | `/api/v1/convenios` | Cria |
| PATCH | `/api/v1/convenios/{uuid}` | Atualiza |
| GET | `/api/v1/convenios/{uuid}/planos` | Planos |
| GET | `/api/v1/convenios/{uuid}/condicoes-contratuais` | Versões |
| POST | `/api/v1/convenios/{uuid}/condicoes-contratuais` | Cria nova versão |

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/tabelas-precos` | Lista |
| POST | `/api/v1/tabelas-precos` | Cria |
| GET | `/api/v1/tabelas-precos/{uuid}/itens` | Itens |
| GET | `/api/v1/tabelas-procedimentos` | Catálogo TUSS/CBHPM |
| GET | `/api/v1/tabelas-procedimentos/{uuid}` | Detalhe |
| POST | `/api/v1/tabelas-procedimentos/importar-tuss` | Importa CSV oficial ANS |

### 2.3 Estrutura física

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/setores` | Lista setores |
| GET | `/api/v1/leitos` | Lista leitos com filtros (setor, status) |
| GET | `/api/v1/leitos/mapa` | Mapa de leitos (resposta otimizada para WebSocket inicial) |
| PATCH | `/api/v1/leitos/{uuid}/status` | Muda status (HIGIENIZACAO, MANUTENCAO) |
| GET | `/api/v1/salas-cirurgicas` | Lista salas |
| GET | `/api/v1/salas-cirurgicas/mapa` | Mapa de salas |

### 2.4 Agendamento

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/agenda/{recurso_uuid}` | Slots disponíveis (range) |
| POST | `/api/v1/agendamentos` | Cria agendamento (constraint EXCLUDE valida) |
| PATCH | `/api/v1/agendamentos/{uuid}` | Reagenda |
| DELETE | `/api/v1/agendamentos/{uuid}` | Cancela (com motivo) |
| POST | `/api/v1/agendamentos/{uuid}/confirmar` | Confirmação de paciente |
| POST | `/api/v1/agendamentos/{uuid}/checkin` | Check-in |
| POST | `/api/v1/agendamentos/{uuid}/no-show` | Marca falta |

### 2.5 Atendimento

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/v1/atendimentos` | Inicia atendimento |
| GET | `/api/v1/atendimentos/{uuid}` | Detalhe |
| PATCH | `/api/v1/atendimentos/{uuid}` | Atualiza dados básicos |
| POST | `/api/v1/atendimentos/{uuid}/triagem` | Classifica risco |
| POST | `/api/v1/atendimentos/{uuid}/internar` | Aloca leito (otimistic lock) |
| POST | `/api/v1/atendimentos/{uuid}/transferir` | Transfere setor/leito |
| POST | `/api/v1/atendimentos/{uuid}/alta` | Encerra (tipo_alta obrigatório) |
| GET | `/api/v1/atendimentos/{uuid}/timeline` | Timeline completa do PEP |

### 2.6 PEP

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/atendimentos/{uuid}/evolucoes` | Lista evoluções |
| POST | `/api/v1/atendimentos/{uuid}/evolucoes` | Cria evolução (não-assinada) |
| POST | `/api/v1/evolucoes/{uuid}/assinar` | Assina (ICP-Brasil) → imutável |
| POST | `/api/v1/evolucoes/{uuid}/retificar` | Cria nova versão (imutabilidade) |
| GET | `/api/v1/atendimentos/{uuid}/sinais-vitais` | Histórico |
| POST | `/api/v1/atendimentos/{uuid}/sinais-vitais` | Registra |

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/atendimentos/{uuid}/prescricoes` | Lista |
| POST | `/api/v1/atendimentos/{uuid}/prescricoes` | Cria prescrição |
| POST | `/api/v1/prescricoes/{uuid}/assinar` | Assina |
| POST | `/api/v1/prescricoes/{uuid}/analisar` | Análise farmacêutica |
| POST | `/api/v1/prescricoes/{uuid}/suspender` | Suspende item |
| POST | `/api/v1/prescricoes/{uuid}/reaprazar` | Reaprazamento |

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/v1/atendimentos/{uuid}/solicitacoes-exame` | Solicita exames |
| GET | `/api/v1/solicitacoes-exame/{uuid}` | Detalhe |
| POST | `/api/v1/solicitacoes-exame/{uuid}/coleta` | Marca coleta |
| POST | `/api/v1/resultados-exame` | Registra resultado |
| POST | `/api/v1/resultados-exame/{uuid}/laudar` | Lauda + assina |

### 2.7 Farmácia

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/farmacia/painel` | Painel por turno |
| POST | `/api/v1/dispensacoes` | Cria dispensação |
| POST | `/api/v1/dispensacoes/{uuid}/separar` | Separar |
| POST | `/api/v1/dispensacoes/{uuid}/dispensar` | Confirmar |
| POST | `/api/v1/dispensacoes/{uuid}/devolver` | Devolução |
| GET | `/api/v1/farmacia/livro-controlados` | Livro |
| POST | `/api/v1/farmacia/livro-controlados/movimento` | Lança movimento |

### 2.8 Centro Cirúrgico

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/centro-cirurgico/mapa` | Mapa de salas |
| POST | `/api/v1/cirurgias` | Agenda cirurgia |
| PATCH | `/api/v1/cirurgias/{uuid}` | Atualiza |
| POST | `/api/v1/cirurgias/{uuid}/confirmar` | Confirma |
| POST | `/api/v1/cirurgias/{uuid}/iniciar` | Início real |
| POST | `/api/v1/cirurgias/{uuid}/encerrar` | Encerramento |
| POST | `/api/v1/cirurgias/{uuid}/ficha-cirurgica` | Salva ficha |
| POST | `/api/v1/cirurgias/{uuid}/ficha-anestesica` | Salva ficha |
| POST | `/api/v1/cirurgias/{uuid}/opme/solicitar` | Solicitação OPME |
| POST | `/api/v1/cirurgias/{uuid}/opme/utilizar` | Registro de uso |

### 2.9 Faturamento

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/contas` | Lista contas |
| GET | `/api/v1/contas/{uuid}` | Detalhe |
| POST | `/api/v1/contas/{uuid}/itens` | Lança item manual |
| DELETE | `/api/v1/contas/{uuid}/itens/{item_uuid}` | Remove item (soft) |
| POST | `/api/v1/contas/{uuid}/elaborar` | Inicia elaboração |
| POST | `/api/v1/contas/{uuid}/recalcular` | Recalcula (idempotente) |
| POST | `/api/v1/contas/{uuid}/fechar` | Fecha (gera snapshots) |
| POST | `/api/v1/contas/{uuid}/reabrir` | Reabre (com permissão) |
| GET | `/api/v1/contas/{uuid}/espelho` | PDF/JSON espelho |

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/v1/tiss/guias/gerar` | Gera guias para conta |
| GET | `/api/v1/tiss/guias/{uuid}/xml` | XML da guia |
| POST | `/api/v1/tiss/lotes` | Cria lote (por convênio + competência) |
| POST | `/api/v1/tiss/lotes/{uuid}/validar` | Valida XSD |
| POST | `/api/v1/tiss/lotes/{uuid}/enviar` | Envia ao convênio |
| GET | `/api/v1/tiss/lotes/{uuid}/protocolo` | Protocolo de retorno |

### 2.10 Glosas

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/glosas` | Lista |
| POST | `/api/v1/glosas/importar-tiss` | Importa retorno TISS |
| POST | `/api/v1/glosas` | Lança manual |
| POST | `/api/v1/glosas/{uuid}/recurso` | Cria recurso |
| POST | `/api/v1/glosas/{uuid}/finalizar` | Finaliza ciclo |

### 2.11 Repasse

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/repasse/criterios` | Lista critérios |
| POST | `/api/v1/repasse/criterios` | Cria |
| POST | `/api/v1/repasse/apurar` | Dispara apuração mensal (assíncrono) |
| GET | `/api/v1/repasse` | Lista repasses |
| GET | `/api/v1/repasse/{uuid}` | Detalhe |
| POST | `/api/v1/repasse/{uuid}/conferir` | Conferência |
| POST | `/api/v1/repasse/{uuid}/liberar` | Libera |
| POST | `/api/v1/repasse/{uuid}/marcar-pago` | Marca pago (integração financeiro) |

### 2.12 CME / CCIH / SAME / Visitantes / BI

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/cme/lotes` | Lista lotes |
| POST | `/api/v1/cme/lotes` | Cria lote |
| POST | `/api/v1/cme/lotes/{uuid}/liberar` | Libera (após biológico) |
| POST | `/api/v1/cme/artigos/{uuid}/movimentar` | Próxima etapa |
| GET | `/api/v1/ccih/casos` | Lista |
| POST | `/api/v1/ccih/casos` | Registra IRAS |
| GET | `/api/v1/same/prontuarios/{uuid}` | Prontuário físico |
| POST | `/api/v1/same/emprestimos` | Empréstimo |
| GET | `/api/v1/visitantes` | Lista |
| POST | `/api/v1/visitas` | Registra entrada |
| POST | `/api/v1/visitas/{uuid}/saida` | Registra saída |
| GET | `/api/v1/bi/dashboards/executivo` | KPIs |
| GET | `/api/v1/bi/dashboards/operacional` | KPIs operacionais |

### 2.13 Portais

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/portal/medico/agenda` | Agenda do médico logado |
| GET | `/api/v1/portal/medico/laudos-pendentes` | Laudos pendentes |
| GET | `/api/v1/portal/medico/producao` | Produtividade |
| GET | `/api/v1/portal/paciente/exames` | Resultados |
| POST | `/api/v1/portal/paciente/agendamento` | Auto-agendamento |
| GET | `/api/v1/portal/paciente/teleconsulta/{uuid}/link` | Link da consulta |
| GET | `/api/v1/portal/paciente/contas` | Histórico financeiro |

### 2.14 LGPD / Auditoria / Admin

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/auditoria/eventos` | Consulta auditoria (filtros) |
| GET | `/api/v1/auditoria/acessos-prontuario` | Quem acessou cada prontuário |
| POST | `/api/v1/lgpd/solicitacoes/acesso` | Paciente solicita seus dados |
| POST | `/api/v1/lgpd/solicitacoes/exclusao` | Solicitação de exclusão (com regra de retenção) |
| GET | `/api/v1/lgpd/exportacao/{uuid}` | Download FHIR/JSON |
| GET | `/api/v1/admin/tenants` | Multi-tenant (apenas admin global) |
| POST | `/api/v1/admin/tenants` | Cria tenant |

### 2.15 Webhooks (recebimento de eventos externos)

| Método | Path | Descrição |
|---|---|---|
| POST | `/api/v1/webhooks/tiss/retorno` | Webhook de retorno TISS |
| POST | `/api/v1/webhooks/lab-apoio/{lab_uuid}` | Resultado de lab externo |
| POST | `/api/v1/webhooks/financeiro/pagamento` | Confirmação de pagamento |

> Webhooks validam assinatura HMAC; payloads idempotentes via `event_id`.

---

## 3. WebSocket (tempo real)

```
wss://<host>/api/v1/realtime
```

Após autenticação (JWT no handshake), o cliente assina canais (rooms):

| Canal | Eventos publicados |
|---|---|
| `tenant:{tenant_uuid}:leitos` | `leito.alocado`, `leito.liberado`, `leito.higienizando` |
| `tenant:{tenant_uuid}:salas-cc` | `sala.iniciada`, `sala.encerrada` |
| `tenant:{tenant_uuid}:farmacia:turno:{turno}` | `prescricao.nova`, `dispensacao.criada` |
| `paciente:{paciente_uuid}` | `evolucao.criada`, `prescricao.emitida` |
| `painel-chamada:{setor_uuid}` | `paciente.chamado` |

Reconexão com backoff exponencial. Server enfileira eventos perdidos por 60s para clientes recém-reconectados (via Redis Streams + consumer group).

---

## 4. OpenAPI

Especificação OpenAPI 3.1 gerada automaticamente em runtime (NestJS Swagger):

```
/api/docs        — Swagger UI
/api/docs-json   — JSON
```

Em produção: protegido por basic auth + permissão de DEV/ADMIN.

---

## 5. Rate limit

Padrão por tenant:

| Tipo | Limite |
|---|---|
| Endpoints de leitura | 600 req/min |
| Endpoints de escrita | 200 req/min |
| Login | 10 tentativas/min/IP |
| TISS geração lote | 5 req/min |

429 com header `Retry-After`.

---

## 6. Total de endpoints

Conta aproximada por seção:

| Seção | # |
|---|:-:|
| Auth & Users | 15 |
| Pacientes/Cadastros | 21 |
| Estrutura física | 6 |
| Agendamento | 7 |
| Atendimento | 8 |
| PEP | 16 |
| Farmácia | 7 |
| Centro Cirúrgico | 10 |
| Faturamento | 15 |
| Glosas | 5 |
| Repasse | 8 |
| CME/CCIH/SAME/Visitantes/BI | 13 |
| Portais | 7 |
| LGPD/Admin | 7 |
| Webhooks | 3 |
| **Total** | **~148** |

> A especificação original cita "~50 endpoints" — esta lista expande conforme detalhamento. Pode ser consolidado em PRs específicos sem alterar o macro.
