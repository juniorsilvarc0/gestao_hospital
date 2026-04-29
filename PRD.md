# PRD.md — Product Requirements Document

> Requisitos funcionais e não-funcionais detalhados.
> Este documento é o **contrato** entre stakeholders e implementação.
> Toda história/feature deve referenciar um RF/RNF.

---

## 1. Convenções

- **RF-XXX-NNN** = Requisito Funcional. Prefixos: `RF-CAD` (cadastros), `RF-AGE` (agendamento), `RF-ATE` (atendimento), `RF-PEP` (prontuário), `RF-INT` (internação), `RF-FAR` (farmácia), `RF-CC` (centro cirúrgico), `RF-CME`, `RF-LAB` (laboratório/imagem), `RF-CCIH`, `RF-FAT` (faturamento), `RF-GLO` (glosa), `RF-REP` (repasse), `RF-TES` (tesouraria), `RF-CUS` (custos), `RF-SAME`, `RF-VIS` (visitantes), `RF-POR` (portais), `RF-BI`, `RF-INTG` (integrações), `RF-AUTH` (segurança).
- **RNF-NNN** = Requisito Não-Funcional.
- **MoSCoW**: cada requisito tem prioridade `[M]ust`, `[S]hould`, `[C]ould`, `[W]on't (Fase 1)`.

---

## 2. Requisitos Funcionais — Cadastros (RF-CAD)

| ID | Prioridade | Descrição | Critério de aceitação |
|---|---|---|---|
| **RF-CAD-001** | M | Cadastrar paciente com dados pessoais, documentos (CPF, RG, CNS), contatos, endereço, alergias, convênios vinculados, foto, consentimento LGPD. | Validações: CPF válido (algoritmo), data de nascimento ≤ hoje, ao menos 1 contato. Duplicidade por CPF. |
| **RF-CAD-002** | M | Histórico completo de atendimentos do paciente (linha do tempo). | Filtros por período, tipo, prestador, setor. Exportável em PDF. |
| **RF-CAD-003** | M | Cadastrar prestador (médico, enfermeiro, etc.) com tipo de conselho, número, UF, especialidades CBOS, tipo de vínculo, regras de repasse. | Validação de número de conselho por UF. CBOS de tabela oficial. |
| **RF-CAD-004** | M | Cadastrar convênio com registro ANS, CNPJ, planos, versão TISS, condições contratuais, tabelas de preços. | TISS deve aceitar versão 4.x atual; pluggable para futuras. |
| **RF-CAD-005** | M | Cadastrar tabelas de procedimentos (TUSS/CBHPM/AMB/SUS) com código, descrição, tipo, grupo de gasto, porte, custo operacional, valor de referência. | Importação em lote via CSV/XLS. |
| **RF-CAD-006** | M | Cadastrar setores e classificá-los (Internação, Ambulatório, PS, CC, UTI, CME, Farmácia, Laboratório, Imagem, Administrativo). | Vinculação obrigatória a unidade de faturamento e atendimento. |
| **RF-CAD-007** | M | Cadastrar leitos com tipo de acomodação, status, vinculação a setor. | Status: Disponível, Ocupado, Reservado, Higienização, Manutenção, Bloqueado. |
| **RF-CAD-008** | M | Cadastrar salas cirúrgicas com tipo, capacidade, equipamentos. | — |
| **RF-CAD-009** | S | Cadastros suportam campos complementares (JSONB) configuráveis por tenant. | Sem migration; configuração via UI admin. |
| **RF-CAD-010** | S | Importação em massa (CSV/XLS) para todos os cadastros principais. | Validação por linha; relatório de erros. |
| **RF-CAD-011** | M | Soft-delete em todos os cadastros, com auditoria de quem, quando, por quê. | Restauração disponível para admin. |

---

## 3. Requisitos Funcionais — Agendamento (RF-AGE)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-AGE-001** | M | Agendar consultas, exames e cirurgias em recursos múltiplos (consultórios, salas, profissionais). |
| **RF-AGE-002** | M | Visão diária, semanal e mensal com cores por status (agendado, confirmado, atendido, cancelado, faltou). |
| **RF-AGE-003** | M | Bloqueio de horários (férias, congressos, manutenção). |
| **RF-AGE-004** | M | Encaixe permitido com flag e justificativa. |
| **RF-AGE-005** | S | Agenda inteligente: dado um procedimento + convênio + duração estimada, sugere primeiro horário disponível. |
| **RF-AGE-006** | M | Confirmação de consulta via SMS/WhatsApp/email com link. |
| **RF-AGE-007** | M | Painel de chamada com nome (se permitido) ou senha, por sala/consultório, com som. |
| **RF-AGE-008** | M | Totem de autoatendimento para check-in e geração de senha. |
| **RF-AGE-009** | M | Teleconsulta: agenda gera link único, registrado em log de acesso. |
| **RF-AGE-010** | M | Cancelamento e remarcação com motivo registrado. |
| **RF-AGE-011** | C | Lista de espera com notificação automática quando vaga abre. |

---

## 4. Requisitos Funcionais — Recepção e Atendimento (RF-ATE)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-ATE-001** | M | Check-in do paciente: verifica agendamento, validade do documento, foto de comparação se houver. |
| **RF-ATE-002** | M | Verificação de elegibilidade do convênio (automática via webservice quando disponível, manual senão). |
| **RF-ATE-003** | M | Solicitação e armazenamento de autorização do convênio com número, validade, procedimentos autorizados. |
| **RF-ATE-004** | M | Classificação de risco por **protocolo de cores** (Manchester ou STM): Vermelho, Laranja, Amarelo, Verde, Azul. Define prioridade da fila. |
| **RF-ATE-005** | M | Fila de atendimento por setor, com priorização automática conforme classificação. |
| **RF-ATE-006** | M | Painel de chamada por voz com nome anonimizado (iniciais ou senha). |
| **RF-ATE-007** | M | Registro do **tipo de atendimento**: Particular, Convênio, SUS. |
| **RF-ATE-008** | M | Toda recepção gera **conta do paciente** automaticamente. |
| **RF-ATE-009** | S | Coleta de assinatura do termo de consentimento LGPD digitalmente (ou em papel + scan). |

---

## 5. Requisitos Funcionais — Internação e Leitos (RF-INT)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-INT-001** | M | Solicitação de internação a partir do PEP ou recepção, com motivo (CID), tipo de acomodação, médico responsável. |
| **RF-INT-002** | M | Autorização do convênio antes da efetivação (quando aplicável). |
| **RF-INT-003** | M | **Mapa de leitos em tempo real** (SVG ou Konva): visão por andar/setor; cores por status; clique para detalhes. |
| **RF-INT-004** | M | Alocação de leito: busca por tipo de acomodação + setor + sexo (se aplicável). Lock distribuído para evitar dupla alocação. |
| **RF-INT-005** | M | Reserva de leito futuro para cirurgia eletiva. |
| **RF-INT-006** | M | Transferência entre leitos/setores com motivo, mantendo histórico. |
| **RF-INT-007** | M | Alta médica com tipo (alta médica, a pedido, transferência, evasão, óbito), CID de saída, resumo. |
| **RF-INT-008** | M | Higienização: ao liberar leito, status vira Higienização; equipe registra conclusão; status vira Disponível. |
| **RF-INT-009** | M | Atualização **em tempo real** via WebSocket de qualquer mudança de status. |
| **RF-INT-010** | M | KPI: taxa de ocupação por setor, dia, mês. |
| **RF-INT-011** | S | Alerta de previsão de alta para 24h, ajudando planejamento de leitos. |

---

## 6. Requisitos Funcionais — PEP (RF-PEP)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-PEP-001** | M | Anamnese estruturada (queixa principal, HMA, antecedentes, medicações, hábitos) com formulários dinâmicos. |
| **RF-PEP-002** | M | Exame clínico estruturado com sinais vitais (PA, FC, FR, T, SatO₂, peso, altura). |
| **RF-PEP-003** | M | Evolução multiprofissional: médico, enfermeiro, nutricionista, fisioterapeuta, psicólogo, farmacêutico. Cada um vê e registra no seu contexto. |
| **RF-PEP-004** | M | **Prescrição médica** com itens (medicamentos, cuidados, dietas, procedimentos), dose, via, frequência, horários, urgência. |
| **RF-PEP-005** | M | **Busca inteligente de medicamentos** com fuzzy match, sugerindo dose/via/frequência usuais. |
| **RF-PEP-006** | M | **Alertas clínicos bloqueantes**: alergia, interação medicamentosa, dose máxima, gestação. Bypass possível com justificativa registrada. |
| **RF-PEP-007** | M | Prescrição gera demanda automática na farmácia e itens na conta. |
| **RF-PEP-008** | M | Análise farmacêutica (farmácia clínica): aprovar, recusar com motivo, aprovar com ressalva. |
| **RF-PEP-009** | M | Reaprazamento pela enfermagem com justificativa registrada. |
| **RF-PEP-010** | M | Solicitação de exames com urgência, indicação clínica, vinculada ao atendimento. |
| **RF-PEP-011** | M | Planejamento terapêutico (objetivos, intervenções, evolução do plano). |
| **RF-PEP-012** | M | Atestados, declarações e receituários emitidos a qualquer momento (mesmo após alta). |
| **RF-PEP-013** | M | Assinatura digital ICP-Brasil (A1/A3) ou TOTVS Assinatura Eletrônica em evoluções, prescrições e laudos. |
| **RF-PEP-014** | M | **Imutabilidade após assinatura**: correção exige nova versão com referência à anterior. |
| **RF-PEP-015** | M | Visualização integrada do histórico clínico: linha do tempo unificada com filtros. |
| **RF-PEP-016** | M | Anexos (PDF, imagens) com OCR opcional para indexação. |
| **RF-PEP-017** | S | Modelos de prescrição/evolução favoritos por médico. |
| **RF-PEP-018** | S | Resumo automático com IA (Claude) com revisão humana obrigatória. |

---

## 7. Requisitos Funcionais — Farmácia (RF-FAR)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-FAR-001** | M | **Painel de dispensação por turno**: matriz pacientes × horários × medicamentos. |
| **RF-FAR-002** | M | Separação e dispensação com leitura de código de barras (lote, validade). |
| **RF-FAR-003** | M | Dispensação por prescrição, avulsa, kit cirúrgico ou devolução. |
| **RF-FAR-004** | M | **Conversão automática de unidades**: prescrição (mg) → dispensação (mL/comprimido) → faturamento (unidade do convênio). |
| **RF-FAR-005** | M | **Livro de medicamentos controlados** integrado, exportável para ANVISA quando exigido. |
| **RF-FAR-006** | M | Devolução ao estoque com motivo (cancelamento, sobra, troca de prescrição). |
| **RF-FAR-007** | M | Integração com **estoque do backoffice** (RM/Protheus/etc.) para baixa e reposição. |
| **RF-FAR-008** | M | Análise farmacêutica de prescrições (ver RF-PEP-008). |
| **RF-FAR-009** | S | Alerta de estoque mínimo e validade próxima. |

---

## 8. Requisitos Funcionais — Centro Cirúrgico (RF-CC)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-CC-001** | M | Agendamento cirúrgico com sala, equipe (cirurgião, auxiliar, anestesista, instrumentador), kits e materiais. |
| **RF-CC-002** | M | Mapa de salas em tempo real. |
| **RF-CC-003** | M | **Kits cirúrgicos**: reserva → distribuição → uso → devolução de não usados → faturamento do consumido. |
| **RF-CC-004** | M | **Caderno de gabaritos**: referência de mat/med esperado por procedimento; comparação com consumo real → relatório de desvios. |
| **RF-CC-005** | M | Ficha cirúrgica (ato cirúrgico): início/fim, achados, técnica, intercorrências. |
| **RF-CC-006** | M | Ficha anestésica (interface com Anestech ou nativa): tipo, drogas, sinais vitais transoperatórios. |
| **RF-CC-007** | M | Classificação da cirurgia (Limpa, Potencialmente Contaminada, Contaminada, Infectada) — obrigatória para CCIH. |
| **RF-CC-008** | M | **OPME**: cadastro com fabricante, ANVISA, lote; autorização prévia do convênio; rastreabilidade. |
| **RF-CC-009** | M | Geração automática de itens na conta a partir do registro da cirurgia. |
| **RF-CC-010** | S | Reaproveitamento de kits e templates por especialidade. |

---

## 9. Requisitos Funcionais — CME (RF-CME)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-CME-001** | M | Recepção de materiais sujos, conferência, registro. |
| **RF-CME-002** | M | Limpeza, preparo e esterilização com lote, autoclave, parâmetros. |
| **RF-CME-003** | M | **Indicador biológico** por ciclo, com aprovação/reprovação. |
| **RF-CME-004** | M | Guarda e distribuição com rastreabilidade completa (lote → kit → paciente). |
| **RF-CME-005** | M | Histórico do material: vida útil, ciclos de esterilização, validade. |
| **RF-CME-006** | S | Indicadores de produtividade da CME e taxa de retrabalho. |

---

## 10. Requisitos Funcionais — Laboratório e Imagem (RF-LAB)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-LAB-001** | M | Recebimento de solicitações do PEP. |
| **RF-LAB-002** | M | Coleta com etiqueta (código de barras), conferência de paciente. |
| **RF-LAB-003** | M | Processamento (lab) ou realização (imagem). |
| **RF-LAB-004** | M | **Central de Laudos web**: laudo estruturado, imagens anexas, assinatura digital. |
| **RF-LAB-005** | M | Encaminhamento para **laboratório de apoio** quando exame não realizado in-house. |
| **RF-LAB-006** | M | Sinônimos de exames (ex.: "hemograma" = "CBC") e instruções de preparo. |
| **RF-LAB-007** | M | Resultado disponível no PEP automaticamente, com notificação ao solicitante. |
| **RF-LAB-008** | S | Comparação histórica de resultados (séries temporais). |

---

## 11. Requisitos Funcionais — CCIH (RF-CCIH)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-CCIH-001** | M | Registro de casos suspeitos/confirmados de infecção hospitalar. |
| **RF-CCIH-002** | M | **Cruzamento paciente × local × prontuário**: rastrear contatos a partir de um caso. |
| **RF-CCIH-003** | M | Indicadores: taxa de infecção, ISC (infecção de sítio cirúrgico) por classificação, surtos. |
| **RF-CCIH-004** | M | Cultura de microorganismos com resultado, perfil de resistência. |
| **RF-CCIH-005** | M | Notificação compulsória ao SINAN (quando exigido). |

---

## 12. Requisitos Funcionais — Faturamento (RF-FAT)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-FAT-001** | M | **Conta do paciente** consolida todos os gastos (procedimentos, diárias, taxas, materiais, medicamentos, OPME, gases, pacotes). |
| **RF-FAT-002** | M | Itens entram automaticamente a partir de PEP, prescrição, cirurgia, farmácia, manualmente quando necessário. |
| **RF-FAT-003** | M | Valoração conforme **tabela de preços do convênio** vigente na data do atendimento (snapshot). |
| **RF-FAT-004** | M | **Elaboração de contas**: revisão visual da conta, adição/correção de itens, justificativa para alterações pós-realização. |
| **RF-FAT-005** | M | **Pacotes**: faturar conjunto de itens por valor fixo conforme regra contratual. |
| **RF-FAT-006** | M | Fechamento da conta: bloqueia alterações e prepara para faturamento. |
| **RF-FAT-007** | M | **Geração TISS XML** das guias: SP/SADT, Internação, Honorários, Outras Despesas, Resumo de Internação. |
| **RF-FAT-008** | M | **Validação XSD** da guia gerada antes de persistir como `GERADA`. |
| **RF-FAT-009** | M | Geração de **lotes de envio** por convênio com `numeroLote`, hash SHA-256, quantidade de guias, valor total. |
| **RF-FAT-010** | M | Geração SUS: BPA-C/I, AIH, APAC. |
| **RF-FAT-011** | M | Faturamento particular com cálculo de multa por cancelamento, descontos, formas de pagamento. |
| **RF-FAT-012** | M | **Espelho de conta** (PDF) para conferência interna e envio ao paciente/convênio. |
| **RF-FAT-013** | M | Caderno de gabaritos: comparar consumo real × esperado, sinalizar desvios na elaboração. |
| **RF-FAT-014** | M | **Condições contratuais por convênio**: coberturas, especialidades habilitadas, agrupamentos, parâmetros TISS, ISSQN. |
| **RF-FAT-015** | M | Reenvio de lote (reenvio gera novo lote referenciando original). |
| **RF-FAT-016** | M | Importação de retornos do convênio (XML TISS de retorno) com aplicação automática de pagamentos e glosas. |

---

## 13. Requisitos Funcionais — Glosas (RF-GLO)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-GLO-001** | M | Recebimento de glosas eletrônico (XML TISS) ou cadastro manual. |
| **RF-GLO-002** | M | Detalhamento por item da conta com motivo, código de glosa TISS, valor. |
| **RF-GLO-003** | M | Recurso de glosa com justificativa e anexos. |
| **RF-GLO-004** | M | Geração de XML TISS de recurso ou documento equivalente. |
| **RF-GLO-005** | M | Acompanhamento de status: Recebida, Em Recurso, Acatada, Revertida, Perda Definitiva. |
| **RF-GLO-006** | M | Relatórios: glosas por convênio, motivo, prestador, período, valor recuperado. |
| **RF-GLO-007** | S | Sugestão automática de causa raiz de glosa por padrão (ex.: "guia sem autorização"). |

---

## 14. Requisitos Funcionais — Repasse Médico (RF-REP)

| ID | Prioridade | Descrição |
|---|---|---|
| **RF-REP-001** | M | **Critérios flexíveis**: por prestador, função, faixa de procedimento, grupo de gasto, convênio, plano, indicação. |
| **RF-REP-002** | M | Tipos de critério: percentual ou valor fixo. |
| **RF-REP-003** | M | **Base de cálculo**: valor total, valor com deduções, valor com acréscimos. |
| **RF-REP-004** | M | **Momento do repasse**: ao faturar, ao confirmar recebimento, com prazo definido. |
| **RF-REP-005** | M | Fechamento por dia do mês (ex.: dia 25) ou manual. |
| **RF-REP-006** | M | Apuração de repasses do período. |
| **RF-REP-007** | M | **Folha de produção** por prestador: lista todos os itens que geraram repasse, valores, descontos, créditos. |
| **RF-REP-008** | M | Liberação de repasses para pagamento (integra Tesouraria). |
| **RF-REP-009** | M | Gestão de créditos, débitos e descontos avulsos por prestador. |
| **RF-REP-010** | M | **Repasse por indicação** funciona apenas antes do controle de glosa (após glosa, não aparece). |
| **RF-REP-011** | M | Prestadores **credenciados direto** pelo convênio são excluídos do repasse (operadora paga direto). |
| **RF-REP-012** | M | Histórico de repasses por prestador exportável. |

---

## 15. Demais módulos (resumido — detalhe nos `docs/0X-*.md`)

| Módulo | Requisitos resumidos |
|---|---|
| **Tesouraria/Caixa** | RF-TES-001..005: pagamentos particulares, alta com cobrança, integração Fluxus. |
| **Custos** | RF-CUS-001..005: custo por paciente/procedimento/convênio/centro de custo. |
| **SAME** | RF-SAME-001..006: arquivamento físico e digital, empréstimo, importação PDF legado. |
| **Visitantes** | RF-VIS-001..004: entrada/saída, vínculo com leito, restrições, rastreabilidade. |
| **Portais** | RF-POR-001..010: agendamento online, resultados, laudos, teleconsulta, histórico, recuperação de senha. |
| **BI** | RF-BI-001..010: dashboards executivo, operacional, clínico, financeiro. |
| **Integrações** | RF-INTG-001..015: Backoffice RM, ANS/TISS, DATASUS, Anestech, labs, IA. |

---

## 16. Requisitos Não-Funcionais

### 16.1 Segurança e privacidade

| ID | Descrição | Critério |
|---|---|---|
| **RNF-001** | Autenticação multi-fator obrigatória para perfis com acesso a PEP. | TOTP no mínimo; WebAuthn opcional. |
| **RNF-002** | Senhas armazenadas com **Argon2id**. | Parâmetros mínimos: m=64MB, t=3, p=4. |
| **RNF-003** | RBAC granular com perfis (Médico, Enfermeiro, Recepção, Faturista, Farmacêutico, Admin, etc.) e permissões por recurso. | Política negada por padrão. |
| **RNF-004** | **Audit log** completo de acessos e alterações em dados de paciente. | Quem, quando, ação, IP, finalidade. Imutável (append-only). |
| **RNF-005** | Criptografia em repouso de colunas sensíveis: CPF, CNS, conteúdo clínico livre. | `pgcrypto` com chaves rotacionáveis. |
| **RNF-006** | TLS 1.3 obrigatório em trânsito. | Sem fallback para TLS 1.2 exceto integrações legadas autorizadas. |
| **RNF-007** | Sem PHI em logs. | Linter automático bloqueia. |
| **RNF-008** | Soft-delete em todas as tabelas clínicas. | Sem `DELETE` físico. |
| **RNF-009** | Direitos LGPD: exportação, anonimização, portabilidade. | Endpoints próprios com 2-fator do titular. |
| **RNF-010** | DPO endpoint para relatório de impacto. | `/api/lgpd/relatorio/{paciente_id}`. |

### 16.2 Disponibilidade e desempenho

| ID | Descrição | Meta |
|---|---|---|
| **RNF-011** | SLA de disponibilidade. | ≥ 99.9% mensal |
| **RNF-012** | RTO. | ≤ 1 hora |
| **RNF-013** | RPO. | ≤ 5 minutos |
| **RNF-014** | Latência P95 de leituras do PEP. | ≤ 500 ms |
| **RNF-015** | Latência P95 de escrita do PEP. | ≤ 1.5 s |
| **RNF-016** | Latência P95 de geração de TISS por guia. | ≤ 60 ms |
| **RNF-017** | Geração de lote de 500 guias TISS. | ≤ 30 s |
| **RNF-018** | Atualização do mapa de leitos. | ≤ 2 s entre evento e propagação |
| **RNF-019** | Concorrência por hospital. | 500 usuários simultâneos sem degradação |
| **RNF-020** | Throughput por instância de API. | ≥ 1000 req/s sustentado |

### 16.3 Escalabilidade

| ID | Descrição |
|---|---|
| **RNF-021** | Multi-tenant por `tenant_id` em todas as tabelas tenanted. |
| **RNF-022** | Escala horizontal de API (stateless, sticky session apenas no WS via Redis Adapter). |
| **RNF-023** | Particionamento de tabelas grandes (`evolucoes`, `prescricoes`, `dispensacoes`, `auditoria_eventos`) por mês. |
| **RNF-024** | Capacidade alvo: 100 hospitais (tenants) na mesma infraestrutura. |

### 16.4 Manutenibilidade

| ID | Descrição |
|---|---|
| **RNF-025** | Cobertura de testes ≥ 80% unitário e ≥ 70% integração nos módulos clínico-financeiros. |
| **RNF-026** | Tempo médio de build CI ≤ 10 min. |
| **RNF-027** | Documentação OpenAPI gerada automaticamente. |
| **RNF-028** | ADRs para toda decisão estrutural. |
| **RNF-029** | Migrations versionadas e reversíveis (sempre que possível). |

### 16.5 Usabilidade

| ID | Descrição |
|---|---|
| **RNF-030** | Acessibilidade WCAG 2.1 AA. |
| **RNF-031** | Suporte a navegadores: últimas 2 versões Chrome, Edge, Firefox, Safari. |
| **RNF-032** | Suporte responsivo (≥ 768 px) para PEP em tablet. |
| **RNF-033** | Idioma da UI: pt-BR; arquitetura preparada para i18n. |
| **RNF-034** | Atalhos de teclado em telas de alta frequência (PEP, dispensação, recepção). |

### 16.6 Compliance

| ID | Descrição |
|---|---|
| **RNF-035** | LGPD (Lei 13.709/2018): consentimento, finalidade, minimização. |
| **RNF-036** | CFM 1.821/2007 e atualizações: PEP, guarda 20 anos, assinatura ICP-Brasil. |
| **RNF-037** | TISS vigente da ANS, com suporte a múltiplas versões coexistindo. |
| **RNF-038** | Padrões SUS DATASUS para BPA/AIH/APAC. |
| **RNF-039** | NBR ISO 27799 como referência de segurança. |
| **RNF-040** | Backup com retenção mínima de 20 anos para prontuário (cumprindo CFM). |

---

## 17. Matriz RF × Módulo × Fase

A matriz completa está em `docs/08-instrucoes-claude-code.md` §3 (Matriz de implementação).

---

## 18. Aceitação e governança

- Todo RF/RNF tem **dono** (humano ou agente líder).
- Mudanças de requisito exigem **issue** no repositório com label `requirement-change` e aprovação.
- Releases são versionadas em SemVer; cada release referencia os RFs/RNFs entregues.
