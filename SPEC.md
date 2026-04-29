# SPEC.md — Especificação de Produto

> Visão geral do produto, escopo, premissas, restrições e critérios de aceitação macro.
> Para detalhamento técnico ver `PRD.md`, `ARCHITECTURE.md` e `DB.md`.

---

## 1. Visão

**HMS-BR** é um sistema modular de **gestão hospitalar completa**, desenhado para hospitais e clínicas brasileiros que precisam operar dentro do ecossistema regulatório nacional (TISS/ANS, SUS, LGPD, ICP-Brasil).

Inspirado funcionalmente no **TOTVS Saúde — Hospitais e Clínicas (Linha RM)**, o HMS-BR cobre todo o ciclo do paciente — da recepção ao faturamento, passando por PEP multiprofissional, internação, centro cirúrgico, farmácia, CME, CCIH, glosas, repasse médico e portais — em uma arquitetura moderna, cloud-ready, multi-tenant e desenvolvida com práticas de engenharia de software contemporâneas.

### 1.1 Posicionamento

| Atributo | HMS-BR |
|---|---|
| **Modelo** | SaaS multi-tenant + opção on-premises |
| **Público** | Hospitais médios e grandes, redes de clínicas, pronto-socorros, hospitais-dia |
| **Diferencial** | Stack moderna, código aberto da camada de domínio, integrações via API REST/GraphQL, UX cuidada para o médico, deploy K8s |
| **Compliance** | LGPD, padrão TISS atual, padrão SUS, ICP-Brasil, NBR ISO 27799 |

---

## 2. Escopo

### 2.1 Dentro do escopo (21 módulos do sistema-base)

1. **Cadastros gerais** — pacientes, prestadores, convênios/planos, tabelas (TUSS/CBHPM/AMB/SUS), unidades de faturamento e atendimento, setores, leitos, salas cirúrgicas.
2. **Agendamento** — consultas, exames, cirurgias, teleconsulta; agenda inteligente; encaixe; confirmação; painel de chamada; totem.
3. **Recepção e Atendimento** — registro, elegibilidade, autorização, classificação de risco, fila, painel de chamada por voz.
4. **Pronto Atendimento** — triagem, urgência/emergência, observação, alta, internação.
5. **Internação e Gestão de Leitos** — solicitação, alocação, mapa de leitos em tempo real, transferência, alta, taxa de ocupação.
6. **PEP — Prontuário Eletrônico** — anamnese, evoluções multiprofissionais, prescrição médica, prescrição de enfermagem, solicitação de exames, planejamento terapêutico, atestados, receituário, assinatura digital.
7. **Farmácia** — dispensação por turno, farmácia clínica, controlados, painel, conversão de unidades, integração com estoque.
8. **Centro Cirúrgico** — agendamento, mapa de salas, kits, gabaritos, ficha cirúrgica, ficha anestésica, OPME.
9. **CME** — recepção, limpeza, preparo, esterilização, guarda, distribuição, rastreabilidade, indicadores biológicos.
10. **Unidade de Diagnóstico** — laboratório, imagem, central de laudos web, lab. de apoio.
11. **CCIH** — gestão de casos, cruzamento paciente×local×prontuário, indicadores, classificação de cirurgias.
12. **Faturamento** — TISS (XML completo), SUS (BPA/AIH/APAC), particular, pacotes, condições contratuais.
13. **Gestão de Glosas** — recebimento eletrônico/manual, recurso, acompanhamento, perdas.
14. **Repasse Médico** — critérios flexíveis, folha de produção, apuração, liberação, créditos/débitos/descontos.
15. **Tesouraria/Caixa** — pagamentos particulares, integração financeira.
16. **Gestão de Custos** — por paciente/procedimento/convênio, desperdícios, centro de custo.
17. **SAME** — controle de documentos físicos e digitalizados, empréstimo, importação de PDF legado.
18. **Controle de Visitantes** — entrada/saída, vínculo com leito, restrições, rastreabilidade.
19. **Portal do Médico/Paciente** — resultados, laudos, agendamento online, teleconsulta, histórico.
20. **Indicadores e BI** — dashboards executivos, operacionais, clínicos.
21. **Integrações** — backoffice, TISS/ANS, DATASUS, Anestech, labs externos, assinatura, IA.

### 2.2 Fora do escopo (Fase 1)

- Backoffice ERP completo (compras, estoque, contábil, RH) — usaremos **integração** com sistemas existentes (RM/Protheus/SAP/etc.).
- Folha de pagamento de funcionários CLT.
- Gestão de obras e patrimônio.
- Marketing/CRM avançado.
- Faturamento internacional/turismo médico.

### 2.3 Fora do escopo (qualquer fase)

- Substituição de equipamentos médicos (PACS, monitores) — apenas **integração**.
- Diagnóstico autônomo por IA (apenas suporte à decisão).

---

## 3. Personas

| Persona | Frequência de uso | Necessidades-chave |
|---|---|---|
| **Médico** (clínico, especialista, plantonista) | Diária, intensa | PEP rápido, prescrição com alertas, busca inteligente de medicamentos, mobile para visita à beira-leito, assinatura digital ágil |
| **Enfermeiro(a)** | Diária, intensa | Reaprazamento, registro de cuidados, sinais vitais, recebimento de prescrições, painel de pendências por paciente |
| **Recepcionista** | Diária | Agendamento rápido, elegibilidade, classificação de risco, fila visual, autorização |
| **Farmacêutico(a)** | Diária | Painel de dispensação por turno, farmácia clínica, livro de controlados, devolução |
| **Faturista** | Diária | Elaboração de contas com itens claros, geração TISS sem dor, espelho de conta para conferência |
| **Gestor financeiro** | Semanal | Glosas por convênio, perdas, repasse, KPIs, contestações |
| **Diretor clínico/médico** | Semanal/mensal | Indicadores, ocupação, produtividade, qualidade assistencial |
| **Administrativo CCIH** | Semanal | Cruzamento de casos, cultura, classificação de cirurgias, taxa de infecção |
| **Paciente** | Eventual | Agendar, ver resultados, teleconsulta, histórico |
| **Auditor (interno e operadora)** | Eventual | Trilha de auditoria, espelho, justificativas |
| **Admin TI** | Diária (em deploy) | Multi-tenant, backups, integrações, observabilidade |

---

## 4. Premissas

1. Hospitais clientes têm **conectividade estável** (banda mínima 50 Mbps, redundância). Modo offline limitado (apenas PEP em leito, com sync ao reconectar) é **roadmap pós-Fase-1**.
2. **PostgreSQL 16+** disponível como banco gerenciado ou self-hosted.
3. Integrações TISS dependem de cada operadora suportar a versão do convênio em vigor — o sistema suporta **múltiplas versões TISS coexistindo** (algumas operadoras ainda em 3.x, outras em 4.x).
4. Hospital cliente possui **certificado digital A1 ou A3 (ICP-Brasil)** para assinatura.
5. Equipe clínica tem dispositivos mobile/tablet aceitáveis para uso à beira-leito.
6. Hospital aceita migração gradual (faseada) e período de **operação dual** com sistema legado durante transição (importante para SAME).

---

## 5. Restrições

### 5.1 Regulatórias (não negociáveis)

- **LGPD** (Lei 13.709/2018): consentimento, finalidade, minimização, segurança, direitos do titular, DPO, RIPD.
- **CFM 1.821/2007** e atualizações: prontuário eletrônico, guarda mínima de 20 anos, assinatura digital ICP-Brasil ou padrão CFM.
- **CFM 2.299/2021**: telemedicina e teleconsulta.
- **Padrão TISS** vigente da ANS (atualmente 4.x; sistema deve ser pluggable para versões futuras).
- **Padrões SUS** do DATASUS para BPA/AIH/APAC.
- **NBR ISO 27799** (segurança da informação em saúde) como referência.
- **Resolução CFM sobre prescrição eletrônica** (2.299/2021 e correlatas).

### 5.2 Técnicas

- **Disponibilidade** alvo: 99.9% (SLA) — máximo 8h45min de indisponibilidade por ano.
- **RTO** (recovery time): ≤ 1 hora.
- **RPO** (recovery point): ≤ 5 minutos.
- **Latência** alvo do PEP: P95 ≤ 500 ms para leitura, P95 ≤ 1.5 s para escrita.
- **Mapa de leitos** atualiza em tempo real (≤ 2 s entre evento e propagação para clientes).
- **Geração TISS**: lote de 500 guias deve sair em ≤ 30 s.
- **Concorrência**: suportar 500 usuários simultâneos por hospital sem degradação perceptível.

### 5.3 Operacionais

- Time inicial pequeno (1 humano + agentes Claude Code).
- Stack escolhida deve **maximizar produtividade** dos agentes (NestJS, React, Prisma — todos com massa crítica em corpus de IA).
- **Documentação como produto**: cada feature entrega doc atualizada.

---

## 6. Indicadores de sucesso (Sistema)

### 6.1 Adoção (operacional)

| KPI | Meta |
|---|---|
| Tempo médio de check-in na recepção | ≤ 3 min (vs 7-10 min em sistemas legados) |
| Tempo médio de prescrição médica no PEP | ≤ 2 min para prescrição padrão |
| % de prescrições com assinatura digital | ≥ 95% após 60 dias de operação |
| Tempo médio de geração de lote TISS | ≤ 30 s para 500 guias |
| % de glosas recursadas dentro do prazo | ≥ 90% |

### 6.2 Confiabilidade

| KPI | Meta |
|---|---|
| Disponibilidade mensal | ≥ 99.9% |
| Erros de validação TISS pós-envio (XSD válido mas operadora rejeita por regra) | ≤ 2% |
| Bugs com impacto clínico em produção | 0 (zero — ponto de atenção máxima) |
| Bugs de faturamento com perda > R$ 1k | 0 |

### 6.3 Qualidade de software

| KPI | Meta |
|---|---|
| Cobertura de testes (módulos clínico-financeiros) | ≥ 80% unitário, ≥ 70% integração |
| Tempo de build CI | ≤ 10 min |
| Densidade de bugs em produção | ≤ 1/KLOC/mês |
| Tempo de onboarding de novo agente Claude Code | ≤ 1 dia (lendo apenas a documentação) |

---

## 7. Critérios de aceitação macro

Para que o sistema seja considerado pronto para uso em produção em um hospital piloto:

1. **Cadastros gerais** funcionais com importação em massa (CSV/XLS) e validação.
2. **PEP** com prescrição digital, assinatura ICP-Brasil, alertas clínicos (alergia, interação, dose) e formulários dinâmicos.
3. **Mapa de leitos** em tempo real com drag-and-drop, suportando 500+ leitos sem lag.
4. **Faturamento TISS** gerando XMLs válidos contra XSD oficial para todas as guias (SP/SADT, Internação, Honorários, Outras Despesas, Resumo).
5. **Faturamento SUS** gerando BPA, AIH e APAC válidos.
6. **Glosas** recebidas, recursadas e acompanhadas com relatórios de perdas.
7. **Repasse médico** apurado e liberado conforme critérios complexos (% por prestador, função, faixa, convênio, indicação).
8. **CCIH** com cruzamento de casos e indicadores.
9. **Audit log LGPD** completo com exportação por titular.
10. **Portais** (médico e paciente) operacionais.
11. **Documentação técnica e operacional** completa.
12. **Plano de migração** documentado e testado em ambiente piloto.

---

## 8. Roadmap (visão macro)

| Trimestre | Marcos |
|---|---|
| Q1 | Fundação + Cadastros + Agendamento + Recepção (Fases 0–2) |
| Q2 | PEP + Internação + Mapa de Leitos + Farmácia (Fases 3–5) |
| Q3 | Centro Cirúrgico + Lab/Imagem + Faturamento TISS/SUS (Fases 6–8) |
| Q4 | Glosas + Repasse + CME + CCIH + Indicadores + Portais (Fases 9–12) |
| Q1 do ano seguinte | Integrações + IA + Mobile + hardening de produção (Fase 13) |

> Premissa: 1 humano coordenando + N agentes do Claude Code em paralelo após Fase 1.

---

## 9. Glossário

Ver `docs/09-glossario.md` para termos completos. Termos centrais já definidos no `CLAUDE.md` §12.
