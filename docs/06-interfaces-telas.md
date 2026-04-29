# 06 — Interfaces e Telas

> Inventário de telas, layout macro, componentes-chave, princípios de UX para healthcare.
> Wireframes detalhados serão produzidos em fase de design (Figma) e referenciados aqui.

---

## 1. Princípios de UX para healthcare

1. **Densidade informacional alta, sem caos.** Profissional de saúde precisa de muito dado em pouco espaço — mas com hierarquia clara.
2. **Cognitive offloading.** Sistema lembra ao usuário (alergias, interações, alertas). Não exige memorização.
3. **Confirmação para ações irreversíveis.** Assinatura digital, alta, óbito — sempre dupla confirmação.
4. **Feedback em <100ms** para ações comuns; loading state para tudo que demorar mais.
5. **Atalhos de teclado** universais (`/` busca, `g+p` agenda paciente, `g+l` mapa de leitos).
6. **Modo claro padrão; modo escuro disponível** (UTI 24h prefere escuro).
7. **Acessibilidade WCAG AA** — contraste, navegação por teclado, aria labels.
8. **Mobile-first em telas de leito** (enfermeira no leito anota direto no celular).
9. **Imutabilidade visível.** Documento assinado mostra "ASSINADO" claramente; correção mostra histórico.
10. **Cores com significado clínico estável**:
    - 🔴 Vermelho: emergência, alergia crítica, óbito.
    - 🟠 Laranja: muito urgente, alerta.
    - 🟡 Amarelo: atenção, urgente.
    - 🟢 Verde: tudo bem, autorizado, dispensado.
    - 🔵 Azul: informativo, agendado.
    - ⚪ Cinza: neutro, inativo.

---

## 2. Layout macro do sistema

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo Hospital]  [Busca global ⌘K]  [Notif] [Avatar] [Tenant]   │  ← topbar
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│  Sidebar │                                                      │
│          │              Conteúdo principal                      │
│  Pacie.  │              (cada tela)                             │
│  Agenda  │                                                      │
│  Recep.  │                                                      │
│  Leitos  │                                                      │
│  PEP     │                                                      │
│  Farma.  │                                                      │
│  CC      │                                                      │
│  Laudos  │                                                      │
│  Faturam │                                                      │
│  Glosas  │                                                      │
│  Repasse │                                                      │
│  BI      │                                                      │
│  Config  │                                                      │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

- **Sidebar colapsável** (ícones-only no estado colapsado).
- **Breadcrumb** abaixo da topbar em telas profundas.
- **Atalhos**: `⌘K` busca global, `⌘P` paciente, `⌘L` leitos.

---

## 3. Catálogo de telas

### 3.1 Dashboard / Home

```
┌────────────────────────────────────────────────────────────────┐
│ KPIs do dia                                                     │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ Atend.  │ │ Ocupação│ │ Cirurg. │ │ Glosas  │                │
│ │ hoje    │ │ leitos  │ │ hoje    │ │ pend.   │                │
│ │  127    │ │  84%    │ │   12    │ │ R$ 45k  │                │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│                                                                 │
│ Gráficos:                                                       │
│  - Atendimentos por hora (linha)                                │
│  - Ocupação por setor (barras)                                  │
│  - Tempo de espera por triagem (caixa)                          │
│                                                                 │
│ Alertas:                                                        │
│  🔴 3 pacientes amarelos > 2h em espera                         │
│  🟠 Lote TISS pendente envio (vence amanhã)                     │
│  🟡 8 prescrições aguardando análise farmacêutica               │
└────────────────────────────────────────────────────────────────┘
```

Componentes: cards de KPI, charts (Recharts), feed de alertas com badges.

---

### 3.2 Agenda

```
┌────────────────────────────────────────────────────────────────┐
│ [Hoje] [< 27/04 >]  [Dia][Semana][Mês]   [+ Agendar]            │
├────────────────────────────────────────────────────────────────┤
│ Recursos:  [Dr. Silva] [Dr. Costa] [Sala 1] [Sala 2] [+ filtro] │
├──────┬──────────────┬──────────────┬──────────────┬────────────┤
│ 8:00 │ Maria Souza  │              │              │            │
│ 8:30 │ João Santos  │ Ana Lima ⚪  │              │            │
│ 9:00 │              │ Pedro Goes   │ Cir. ortop.  │            │
│  …   │              │              │              │            │
└──────┴──────────────┴──────────────┴──────────────┴────────────┘
                           Slots: drag and drop para mover
                           Cores: status (agendado, confirmado,
                                  em atendimento, faltou)
```

Componentes: FullCalendar, drag-and-drop, modal de criação/edição, encaixe.

---

### 3.3 Recepção / Check-in

```
┌────────────────────────────────────────────────────────────────┐
│ Busca: [____________]  Filtros: [Hoje] [Esperando]              │
├────────────────────────────────────────────────────────────────┤
│ Paciente             | Hora    | Médico    | Status            │
│ Maria Souza          | 8:00    | Dr. Silva | Aguardando triagem│
│ João Santos          | 8:30    | Dr. Silva | Em atendimento    │
│ ...                                                             │
└────────────────────────────────────────────────────────────────┘

Modal de check-in:
┌─────────────────────────────────────────┐
│ Maria Souza                              │
│ CPF: ***.***.***-89  Conv: Unimed        │
│ [✓] Documento conferido                  │
│ [✓] Carteirinha válida                   │
│ [Consulta elegibilidade] → OK            │
│ [Imprimir senha]                          │
│ [Enviar para triagem]                     │
└─────────────────────────────────────────┘
```

---

### 3.4 Mapa de Leitos

```
┌────────────────────────────────────────────────────────────────┐
│ [Todos setores ▾]  [🟢 Disponível] [🔴 Ocupado] [🟡 Higien.]    │
├────────────────────────────────────────────────────────────────┤
│ Setor: ENFERMARIA — 4º andar                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ 401A │ │ 401B │ │ 402A │ │ 402B │ │ 403A │ │ 403B │         │
│ │ M.S. │ │ J.P. │ │      │ │ G.L. │ │ H.M. │ │      │         │
│ │ 7d   │ │ 2d   │ │  ✓   │ │ 12d  │ │ 1d   │ │  ✓   │         │
│ │ 🔴   │ │ 🔴   │ │ 🟢   │ │ 🔴   │ │ 🔴   │ │ 🟢   │         │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
└────────────────────────────────────────────────────────────────┘
        Hover → tooltip com paciente, idade, médico, dieta
        Click → ações (transferir, alta, observação)
        WebSocket live update
```

---

### 3.5 PEP — Prontuário Eletrônico do Paciente

Layout em 3 colunas:

```
┌─────────────┬─────────────────────────────┬────────────────────┐
│ COL ESQ     │ COL CENTRAL                 │ COL DIREITA        │
│ Paciente    │ Timeline                    │ Resumo clínico     │
│             │                             │                    │
│ [Foto]      │ Filtros: [Tudo▾]            │ [Sinais vitais]    │
│ Maria Souza │                             │ PA: 130/85         │
│ 67a F       │ ▸ 28/04 14:30  Evolução     │ FC: 78             │
│ Quarto 401A │   Dr. Silva (Cardio)        │ FR: 16             │
│             │   "Paciente refere..."      │ Sat: 96%           │
│ ⚠ Alergias  │                             │                    │
│ • Penicilin │ ▸ 28/04 12:00  Prescrição   │ [Alergias]         │
│ • Iodo      │   Dipirona 1g 8/8h          │ Penicilina (alta)  │
│             │                             │                    │
│ 🩺 Comorbid.│ ▸ 28/04 09:00  Sinais Vit.  │ [Cuidados]         │
│ • HAS       │   PA 130/85, FC 78          │ • Dieta líquida    │
│ • DM2       │                             │ • Aferir PA 4/4h   │
│             │ ▸ 27/04 22:30  Exame lab    │                    │
│ [+ Inter-   │   Hemograma — laudo final   │ [Exames pendentes] │
│  consulta]  │                             │ • Ecocardiograma   │
└─────────────┴─────────────────────────────┴────────────────────┘
       Botões flutuantes:
       [+ Evolução]  [+ Prescrição]  [+ Exame]  [+ Atestado]
```

**Editor de evolução** (TipTap):
- Macros (`/sintomas` expande para template).
- Sinais vitais inline.
- Anexos (imagens, áudio).
- "Salvar rascunho" + "Assinar" (botão grande, vermelho, exige confirmação).

---

### 3.6 Prescrição

```
┌────────────────────────────────────────────────────────────────┐
│ Nova prescrição — Maria Souza (Quarto 401A)                     │
├────────────────────────────────────────────────────────────────┤
│ Tipo: ◉ Medicamento  ○ Cuidado  ○ Dieta  ○ Procedimento         │
│                                                                 │
│ Medicamento: [Dipirona____________] (autocomplete TUSS)         │
│   ⚠ Não há alergia documentada                                  │
│                                                                 │
│ Dose: [1] [g▾]   Via: [VO▾]   Frequência: [8/8h▾]               │
│ Duração: [5 dias]   ☑ Se necessário (SOS)                       │
│                                                                 │
│ Horários: 06:00, 14:00, 22:00                                   │
│                                                                 │
│ [+ Adicionar item]                                              │
│                                                                 │
│ Validade: [28/04 14:30] → [03/05 14:30]                         │
│                                                                 │
│ [Salvar rascunho]   [Verificar e Assinar →]                     │
└────────────────────────────────────────────────────────────────┘

Verificação automática antes de assinar:
✓ Sem alergia ao princípio ativo
✓ Sem interação severa com prescrições ativas
⚠ Dose acima da máxima diária — confirmar?
```

---

### 3.7 Painel da Farmácia

```
┌────────────────────────────────────────────────────────────────┐
│ Turno: [Manhã (06-12)▾]   Setor: [Todos▾]                       │
├────────────────────────────────────────────────────────────────┤
│ Pendentes (12)                                                  │
│ ┌──────────────────────────────────────────────────────┐       │
│ │ Maria Souza — Quarto 401A                  ⚠ URGENTE │       │
│ │ Dipirona 1g VO 8/8h — Próxima 06:00                  │       │
│ │ [Separar]  [Dispensar]                                │       │
│ └──────────────────────────────────────────────────────┘       │
│ ┌──────────────────────────────────────────────────────┐       │
│ │ João Santos — Quarto 305A                            │       │
│ │ Cefazolina 1g EV 8/8h — Próxima 06:00                │       │
│ │ Lote: ABC123  Validade: 12/2026                      │       │
│ │ [Separar]  [Dispensar]                                │       │
│ └──────────────────────────────────────────────────────┘       │
│ ...                                                             │
├────────────────────────────────────────────────────────────────┤
│ Análise farmacêutica pendente (3)                               │
│ ...                                                             │
├────────────────────────────────────────────────────────────────┤
│ Controlados (livro)                                             │
│ Saldo de Morfina 10mg/mL: 47 ampolas (movimento → )             │
└────────────────────────────────────────────────────────────────┘
                   WebSocket: novas prescrições aparecem
                   automaticamente
```

---

### 3.8 Centro Cirúrgico — Mapa de Salas

```
┌────────────────────────────────────────────────────────────────┐
│ 28/04/2026 — Mapa de Salas                                      │
├────────────────────────────────────────────────────────────────┤
│       │ Sala 1    │ Sala 2     │ Sala 3   │ Hemo. │ Sala 5     │
├───────┼───────────┼────────────┼──────────┼───────┼────────────┤
│ 7:00  │ Cesárea   │            │ Coleci.  │       │            │
│ 7:30  │ M.Souza   │ Apend.     │ J.P.     │ Cate. │ HÉRNIA     │
│ 8:00  │ Dr. C.    │ R.M.       │ Dr. S.   │ G.A.  │ A.S.       │
│ 8:30  │ EM AND.   │ Dr. F.     │ AGEND.   │ Dr.X. │ EM AND.    │
│ 9:00  │           │ EM AND.    │          │       │            │
│  ...  │           │            │          │       │            │
└───────┴───────────┴────────────┴──────────┴───────┴────────────┘
   Cada slot: paciente, cirurgião, status, duração
   Cores: agendada, confirmada, em andamento, encerrada
   Click: detalhe + ações (iniciar, encerrar, fichas)
```

---

### 3.9 Cirurgia — Ficha Cirúrgica

Ficha multi-aba: identificação, equipe, descrição, materiais utilizados, intercorrências, OPME, contagem de compressas/instrumentais.

```
[ Identificação | Equipe | Descrição | Materiais | OPME | Intercorrências | Encerramento ]
```

Cada aba é um stepper. Para encerrar a cirurgia, todas as obrigatórias devem estar preenchidas.

---

### 3.10 Central de Laudos (Diagnóstico)

```
┌────────────────────────────────────────────────────────────────┐
│ Filtros: [Modalidade▾] [Pendente▾] [Hoje▾] [Médico▾]            │
├────────────────────────────────────────────────────────────────┤
│ Paciente | Modal. | Estudo | Data    | Status   | Ações         │
│ M.Souza  | RX     | Tórax  | 28/04   | Pend.    | [Laudar]      │
│ J.Santos | TC     | Abdome | 28/04   | Em rev.  | [Continuar]   │
│ A.Lima   | US     | OB     | 27/04   | Final    | [Visualizar]  │
└────────────────────────────────────────────────────────────────┘

Laudar (modal/tela cheia):
- Visualizador DICOM à esquerda (referência ao PACS).
- Editor estruturado à direita (templates por modalidade).
- Botão grande [Assinar e Liberar].
```

---

### 3.11 Elaboração de Contas

```
┌────────────────────────────────────────────────────────────────┐
│ Conta nº 2026-00123 — Maria Souza — Internação                  │
│ Convênio: Unimed | Plano: Premium | Status: EM_ELABORACAO       │
├────────────────────────────────────────────────────────────────┤
│ Filtro grupo: [Todos▾]  [⚠ Inconsistências (3)]                  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────┐       │
│ │ DIARIA  | Diária Apt. Premium  | 4d | R$ 800,00/d   │       │
│ │ ✓ Autorizado  Senha: ABC123                           │       │
│ └──────────────────────────────────────────────────────┘       │
│ ┌──────────────────────────────────────────────────────┐       │
│ │ MEDIC.  | Dipirona 1g          | 12 | R$ 8,40        │       │
│ │ Origem: Prescrição #PRE-2026-0089                     │       │
│ └──────────────────────────────────────────────────────┘       │
│ ┌──────────────────────────────────────────────────────┐       │
│ │ ⚠ OPME  | Prótese de quadril   | 1  | R$ 18.000,00  │       │
│ │ Sem registro ANVISA confirmado — bloqueando           │       │
│ │ [Resolver]                                            │       │
│ └──────────────────────────────────────────────────────┘       │
│                                                                 │
│ TOTAIS                                                          │
│ Procedimentos: R$ 12.500   Diárias: R$ 3.200                    │
│ Materiais: R$ 18.450        Medicamentos: R$ 850                │
│ TOTAL: R$ 35.000                                                │
│                                                                 │
│ [Recalcular]  [Imprimir espelho]  [Fechar conta →]              │
└────────────────────────────────────────────────────────────────┘
```

---

### 3.12 Faturamento TISS

```
[Lotes em preparação] [Lotes enviados] [Retornos] [Glosas]

Lote em preparação:
- Convênio: Unimed
- Competência: 2026-04
- Guias: 47 (R$ 145.300)
- [Validar XSD]  → ✓ OK
- [Gerar XML]    → 2026-04-001.xml (hash a3f...)
- [Enviar]
```

---

### 3.13 Glosas

```
[Recebidas] [Em recurso] [Finalizadas]

Lista filtrada por convênio, competência, valor.
Click → detalhe da glosa, item glosado, motivo, [Recorrer].

Recurso (tela):
- Texto livre + templates.
- Anexar documentos (autorização, evolução, foto OPME, etc.).
- Prazo: até DD/MM/AAAA.
- [Enviar recurso].
```

---

### 3.14 Repasse Médico

```
[Apuração] [Conferência] [Liberação] [Pagos]

Competência: 2026-03
Prestador: Dr. Silva (CRM 12345-SP)

Itens (47):
Conta     | Procedimento     | Valor base | %     | Repasse
2026-099  | Cesárea          | R$ 3.500   | 60%   | R$ 2.100
2026-101  | Consulta         | R$ 200     | 100%  | R$ 200
...

TOTAL APURADO: R$ 28.450
DEDUÇÕES: R$ 2.100 (glosas confirmadas)
LÍQUIDO:  R$ 26.350

[Conferir]  [Liberar]
```

---

### 3.15 Portal Médico

```
- Minha Agenda (view simplificada da agenda)
- Laudos pendentes
- Pacientes do dia (lista)
- Produção (gráficos: atendimentos, valor faturado, valor recebido)
- Repasse (extratos por competência)
```

### 3.16 Portal Paciente

```
- Próximos agendamentos / [Reagendar] / [Cancelar]
- Resultados de exames (download PDF)
- Receitas e atestados
- Histórico de atendimentos
- Teleconsulta (botão "Entrar" 30 min antes)
- Faturas e boletos (particular)
- Solicitações LGPD (acessar meus dados, exportar)
```

---

## 4. Componentes reutilizáveis (design system)

| Componente | Uso |
|---|---|
| `<PacienteCard>` | Resumo do paciente (foto, nome, idade, alergias) |
| `<TimelineEvento>` | Item da timeline do PEP |
| `<SinaisVitaisInput>` | Formulário com validação fisiológica |
| `<Prescritor>` | Editor de prescrição com validações |
| `<MapaLeitos>` | Grid de leitos com WebSocket |
| `<MapaSalasCC>` | Grid de salas |
| `<CalendarioRecursos>` | FullCalendar wrapped |
| `<TabelaInfinita>` | Tabela com paginação cursor |
| `<AssinadorICP>` | Modal de assinatura digital |
| `<UploaderArquivos>` | Drag-and-drop com S3 |
| `<AlertaClinico>` | Banner de alerta com cores semânticas |
| `<ConfirmacaoCritica>` | Modal de confirmação para ações irreversíveis |

---

## 5. Estados, loading e erro

- **Skeleton screens** em listas/dashboards (não spinner cheio de tela).
- **Optimistic UI** em ações simples (marcar item como dispensado).
- **Estados de erro com ação clara** (não só "erro genérico"; sempre "tentar novamente" ou "contatar suporte com ID X").
- **Modo offline** em telas críticas (PEP)? **Não na v1.** Versão futura: cache de leitura via IndexedDB.

---

## 6. Acessibilidade e i18n

- Português (pt-BR) padrão.
- Estrutura preparada para inglês (futuro — mercado externo).
- Todos os componentes interativos com `aria-label`.
- Focus traps em modais.
- Skip-to-content link.
