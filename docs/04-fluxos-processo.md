# 04 — Fluxos de Processo

> Fluxos macro do hospital. Cada fluxo aponta para as regras de negócio (`docs/03-regras-negocio.md`) e tabelas (`DB.md`) envolvidas.

---

## Convenções dos diagramas

- `[ Estado ]` = etapa do fluxo
- `→` = transição automática
- `↘` = transição condicional
- `(RN-XXX-NN)` = regra aplicada
- `Tabela: <nome>` = persistência envolvida

---

## Fluxo 1 — Atendimento Ambulatorial

```
[Agendamento] → [Check-in / Recepção] → [Triagem] → [Consulta Médica]
       │              │                     │             │
       │              │                     │             ▼
       │              │                     │      [Solicitação de
       │              │                     │       exame/receita]
       │              │                     │             │
       │              │                     │             ▼
       │              │                     │      [Atestado/Documento]
       │              │                     │             │
       └─→ Tabela:    └─→ Tabela:           └─→ Tabela:   └─→ Tabela:
           agendamentos  atendimentos          evolucoes     prescricoes,
                                                             documentos_emitidos
```

**Etapas detalhadas:**

1. **Agendamento** (recepcionista, paciente via portal ou totem)
   - Verifica disponibilidade do recurso (médico/sala). (RN-AGE-01, RN-AGE-02)
   - Aplica regras de encaixe se for o caso. (RN-AGE-06)
   - Confirmação 24h antes. (RN-AGE-03)

2. **Check-in / Recepção**
   - Recepção verifica documento, atualiza dados. (RN-ATE-01)
   - Consulta elegibilidade do convênio. (RN-ATE-02)
   - Solicita autorização se necessário. (RN-ATE-03)
   - Atendimento muda para `EM_ESPERA`.

3. **Triagem (PA/Pronto Atendimento)** — apenas se não-eletivo
   - Profissional aplica Manchester. (RN-ATE-04)
   - Sinais vitais coletados.
   - Atendimento muda para `EM_TRIAGEM` → `EM_ATENDIMENTO`.

4. **Consulta Médica**
   - Anamnese → exame clínico → hipótese diagnóstica.
   - Pode gerar: prescrição, solicitação de exame, atestado, encaminhamento.
   - Evolução assinada digitalmente. (RN-PEP-02, RN-PEP-03)

5. **Encerramento**
   - Atendimento muda para `ALTA`.
   - Conta gerada (1:1 com atendimento).

---

## Fluxo 2 — Internação Eletiva

```
[Solicitação de internação]
        │
        ▼
[Pré-internação:
 autorização do convênio
 (se necessário)]      ← (RN-FAT-01)
        │
        ↘ (urgência: pula para Admissão)
        ▼
[Reserva de leito]     ← Tabela: leitos (status RESERVADO)
        │
        ▼
[Admissão / Internação]
        │
        ├─→ Aloca leito (status OCUPADO; otimistic lock)
        ├─→ Cria atendimento tipo INTERNACAO
        └─→ Nota de admissão (24h)  ← (RN-PEP-08)
        │
        ▼
[Internação ativa] ───────────────────────────────────┐
        │                                              │
        ├─→ Evoluções multiprofissionais (PEP)         │
        ├─→ Prescrições + análise farmacêutica         │
        ├─→ Dispensações de medicamentos por turno     │
        ├─→ Solicitações de exame                      │
        ├─→ Cirurgias (se aplicável)                   │
        ├─→ Pareceres / interconsultas                 │
        ├─→ Visitantes                                 │
        ▼                                              │
[Decisão de alta]                                       │
        │                                              │
        ├─→ Alta médica → resumo de alta (obrigatório)  │
        ├─→ Alta a pedido (TALD assinado)               │
        ├─→ Transferência → novo atendimento            │
        ├─→ Evasão (registrada)                         │
        └─→ Óbito (declaração de óbito + CID)           │
        │                                              │
        ▼                                              │
[Encerramento]  ────────────────────────────────────────┘
        │
        ├─→ Leito muda para HIGIENIZACAO
        ├─→ Atendimento muda para ALTA
        └─→ Conta vai para EM_ELABORACAO
```

**Pontos críticos:**
- Alocação de leito usa `SELECT ... FOR UPDATE` + `versao` para evitar dois pacientes no mesmo leito.
- Resumo de alta obrigatório antes de mudar status. (RN-PEP-09)
- Em óbito, registra causa e dispara fluxo SAME (arquivo).

---

## Fluxo 3 — Pronto Atendimento (Urgência)

```
[Chegada do paciente]
        │
        ▼
[Cadastro rápido / Boletim de PA]   ← cadastro mínimo aceito (RN-ATE-01 flexível)
        │
        ▼
[Triagem Manchester]                ← obrigatória (RN-ATE-04)
        │
        ├─→ Vermelho/Laranja → atendimento imediato
        ├─→ Amarelo → fila prioritária
        └─→ Verde/Azul → fila normal
        ▼
[Consulta médica]
        │
        ├─→ Alta com receita
        ├─→ Observação (até 12h)
        ├─→ Internação → Fluxo 2
        └─→ Transferência (intra ou para outro hospital)
```

---

## Fluxo 4 — Cirurgia

```
[Indicação cirúrgica
 na internação ou ambulatório]
        │
        ▼
[Agendamento de cirurgia]
        │
        ├─→ Sala (constraint EXCLUDE; sem sobreposição) (RN-CC-01)
        ├─→ Equipe (cirurgião, auxiliar, anestesista, instrumentador)
        ├─→ Kit cirúrgico definido
        ├─→ Caderno gabarito (materiais e medicamentos previstos)
        └─→ OPME solicitada → autorização do convênio (RN-CC-02, RN-CC-03)
        │
        ▼
[Pré-operatório]
        │
        ├─→ Check-list cirúrgico OMS (anti-coagulação, alergias, lateralidade)
        └─→ Consentimento informado assinado
        │
        ▼
[Sala — Início real registrado]    ← (RN-CC-05)
        │
        ▼
[Cirurgia em andamento]
        │
        ├─→ Ficha cirúrgica preenchida
        ├─→ Ficha anestésica preenchida (Anestech ou própria)
        ├─→ Materiais utilizados (gabarito + extras)
        └─→ Intercorrências registradas
        │
        ▼
[Encerramento da cirurgia]         ← (RN-CC-04)
        │
        ├─→ Materiais consolidados em contas_itens (RN-CC-06)
        ├─→ Repasse calculado por função (RN-CC-08)
        └─→ Artigos para CME (etapa RECEPCAO)
        │
        ▼
[Sala fica HIGIENIZACAO → DISPONIVEL]
```

---

## Fluxo 5 — Prescrição → Farmácia

```
[Médico cria prescrição]
        │
        ├─→ Validações pré-emissão:
        │     - Alergia (RN-PEP-05)
        │     - Interação medicamentosa (RN-PEP-06)
        │     - Dose máxima (RN-PRE-07)
        │
        ▼
[Status AGUARDANDO_ANALISE]
        │
        ▼
[Análise Farmacêutica]            ← (RN-PRE-01)
        │
        ├─→ APROVADA → status ATIVA
        ├─→ APROVADA_RESSALVAS → ATIVA com observações
        └─→ RECUSADA → notifica prescritor (parecer obrigatório)
        │
        ▼
[Painel de Farmácia]
        │
        ├─→ Medicamento controlado → Livro de Controlados (RN-PRE-03)
        └─→ Medicamento comum → dispensação por turno
        │
        ▼
[Dispensação]
        │
        ├─→ Lote, validade, qtd dispensada
        ├─→ Conversão prescrita → dispensada (fator) (RN-FAR-03)
        └─→ Lança em contas_itens (vínculo conta×dispensação)
        │
        ▼
[Administração no leito]
        │
        └─→ Enfermeiro confirma; evento registrado em PEP
```

---

## Fluxo 6 — Solicitação de Exame → Laudo

```
[Solicitação de exame]
        │
        ├─→ Indicação clínica obrigatória
        ├─→ Urgência: ROTINA / URGENTE / EMERGENCIA
        └─→ Convênio: autorização se necessário
        │
        ▼
[Coleta / Realização]
        │
        ├─→ Lab interno → execução
        └─→ Lab apoio (externo) → envio + retorno
        │
        ▼
[Resultado]
        │
        ├─→ Laudo estruturado (lab, valores de referência)
        ├─→ Laudo livre (imagem, anatomopatologia)
        └─→ Imagens (DICOM) referenciadas
        │
        ▼
[Assinatura do laudista (ICP-Brasil)]
        │
        └─→ status: LAUDO_FINAL
        │
        ▼
[Disponível em PEP, Portal Médico, Portal Paciente]
```

---

## Fluxo 7 — Faturamento (Conta → TISS → Recebimento)

```
[Atendimento encerrado]
        │
        ▼
[Conta ABERTA → EM_ELABORACAO]
        │
        ├─→ Faturista revisa itens
        ├─→ Confere autorizações
        ├─→ Aplica tabela de preços vigente
        ├─→ Monta pacotes
        └─→ Resolve inconsistências
        │
        ▼
[Snapshots gravados]              ← (RN-FAT-02)
        │
        ├─→ Versão TISS
        ├─→ Tabela de preços
        └─→ Condição contratual
        │
        ▼
[Conta FECHADA]
        │
        ▼
[Geração de guia TISS]
        │
        ├─→ Validação XSD (RN-FAT-03)
        ├─→ Hash SHA-256 do XML
        └─→ Empacotamento em lote (por convênio + competência)
        │
        ▼
[Lote ENVIADO ao convênio]
        │
        ▼
[Aguarda retorno]
        │
        ├─→ Recibo eletrônico → status ACEITA
        ├─→ Erros de processamento → reenvio (RN-FAT-04)
        └─→ Glosas eletrônicas → Fluxo 8
        │
        ▼
[Confirmação de pagamento]
        │
        └─→ Conta PAGA, valores creditados, repasse liberado
```

---

## Fluxo 8 — Glosas e Recursos

```
[Glosa recebida (eletrônica TISS ou manual)]
        │
        ├─→ Vinculada ao item da conta (RN-GLO-01)
        └─→ Status RECEBIDA
        │
        ▼
[Análise pelo faturista]
        │
        ├─→ Acatar (perda parcial) → ACATADA
        └─→ Recorrer → status EM_RECURSO
        │
        ▼
[Preparação do recurso]
        │
        ├─→ Texto do recurso
        ├─→ Documentos anexos (autorização, evolução, etc.)
        └─→ Prazo monitorado (D-7, D-3, D-0)        ← (RN-GLO-03)
        │
        ▼
[Envio ao convênio]
        │
        ▼
[Resposta]
        │
        ├─→ REVERTIDA_TOTAL → conta atualizada (RN-GLO-04)
        ├─→ REVERTIDA_PARCIAL → conta atualizada
        └─→ NEGADA → PERDA_DEFINITIVA (RN-GLO-05)
        │
        ▼
[Reapuração de Repasse]            ← (RN-REP-06)
```

---

## Fluxo 9 — Repasse Médico

```
[Fim da competência (mensal)]
        │
        ▼
[Job de Apuração]
        │
        ├─→ Identifica prestadores com itens no período (RN-REP-01)
        ├─→ Aplica critério vigente na DATA DO ITEM (RN-REP-03)
        ├─→ Calcula base de cálculo conforme tipo (RN-REP-04)
        └─→ Soma deduções/acréscimos
        │
        ▼
[Repasse APURADO por prestador]
        │
        ▼
[Conferência (financeiro)]         ← (RN-REP-05)
        │
        ▼
[Repasse LIBERADO]
        │
        ▼
[Pagamento (integração financeiro)]
        │
        └─→ Repasse PAGO
```

---

## Fluxo 10 — CME (Esterilização)

```
[Artigo retorna do uso (CC ou outro)]
        │
        ▼
[Recepção CME]                     ← etapa RECEPCAO
        │
        ▼
[Limpeza e descontaminação]
        │
        ▼
[Preparo / Empacotamento]
        │
        ▼
[Esterilização (autoclave/ETO/plasma)]
        │
        ├─→ Indicador químico
        └─→ Indicador biológico (RN-CME-01)
        │
        ▼
[Liberação] — só com indicador biológico positivo
        │
        ▼
[Guarda]                           ← validade controlada (RN-CME-04)
        │
        ▼
[Distribuição → uso]               ← rastreabilidade ao paciente (RN-CME-05)
```

---

## Pontos transversais

### Eventos de domínio publicados em Redis Streams

| Evento | Disparado em | Consumidores |
|---|---|---|
| `AtendimentoIniciado` | Recepção | Faturamento (cria conta), Auditoria |
| `EvolucaoAssinada` | PEP | Auditoria, BI |
| `PrescricaoEmitida` | Prescrição | Farmácia (painel) |
| `DispensacaoConcluida` | Farmácia | Faturamento (lança item) |
| `ContaFechada` | Faturamento | TISS (gera guia), Repasse (sinaliza) |
| `GuiaTISSEnviada` | TISS | Faturamento (atualiza status) |
| `GlosaRecebida` | TISS / manual | Faturamento, Repasse, BI |
| `RepasseLiberado` | Repasse | Notificação ao prestador |
| `LeitoLiberado` | Internação | Mapa de leitos, Agendamento |
| `CirurgiaEncerrada` | CC | Faturamento (lança itens), Repasse, CME |

### Outbox pattern

Toda transação que precisa publicar evento grava na própria transação em `outbox_events`. Worker BullMQ lê pendentes e publica em Redis Streams. Garante consistência mesmo com crash entre commit e publish.
