# 01 — Visão Geral do Sistema

> Mapa do que o HMS-BR é, dos módulos, dos atores e dos conceitos transversais.
> Documento espelha o **Item 1** da especificação original.

---

## 1. Propósito

O HMS-BR é um **sistema de gestão hospitalar completo** funcionalmente equivalente ao TOTVS Saúde – Hospitais e Clínicas (Linha RM), construído com stack moderna (NestJS + PostgreSQL + React) e foco em:

- **Compliance brasileiro**: TISS (ANS), TUSS, SUS (BPA/AIH/APAC), LGPD, ICP-Brasil.
- **Multi-tenant**: uma instalação serve múltiplos hospitais/grupos.
- **Tempo real**: mapas de leitos, painéis de farmácia e chamada operam via WebSocket.
- **Auditável fim a fim**: toda operação clínica e financeira é rastreável.

O sistema cobre **todo o ciclo de atendimento hospitalar**: agendamento, recepção, triagem, pronto atendimento, internação, gestão de leitos, PEP multiprofissional, prescrição, farmácia, centro cirúrgico, diagnóstico, faturamento, gestão de glosas, repasse, CME, CCIH, SAME, custos, portais, integrações e BI.

---

## 2. Atores do sistema

| Ator | Função primária | Módulos principais |
|---|---|---|
| **Paciente** | Recebe atendimento; usa portal/teleconsulta | Portal Paciente, Mobile |
| **Médico** | Atende, prescreve, opera, lauda | PEP, Prescrição, Centro Cirúrgico, Central de Laudos, Portal Médico |
| **Enfermeiro / Téc. Enfermagem** | Triagem, cuidados, evolução, reaprazamento | PEP (evolução enfermagem), Triagem |
| **Farmacêutico** | Análise farmacêutica, dispensação, controle | Farmácia, Painel de Dispensação, Livro de Controlados |
| **Recepcionista** | Cadastro, agendamento, check-in, elegibilidade | Recepção, Agendamento |
| **Triagem** | Classificação de risco | Triagem (Manchester) |
| **Faturista** | Elaboração de contas, geração TISS, glosas | Elaboração de Contas, Faturamento, Glosas |
| **Financeiro / Tesouraria** | Repasse, recebimentos | Repasse, Tesouraria |
| **Auditor (interno/externo)** | Auditoria de contas e prontuários | Auditoria, BI |
| **Admin TI** | Cadastros base, perfis, integrações | Configuração, Integrações |
| **Gestor / Diretor** | Indicadores, decisão | BI, Dashboards |
| **Visitante** | Acesso à internação | Controle de Visitantes |

> Cada ator tem um **perfil RBAC** e regras finas via ABAC quando necessário (ex.: médico só vê pacientes do seu setor por default; com flag, vê todos).

---

## 3. Os 21 módulos do sistema (espelho do TOTVS RM)

> Mantém a numeração da especificação original para rastreabilidade.

| # | Módulo | Resumo |
|:-:|---|---|
| 1 | **Cadastros Gerais** | Pacientes, prestadores, convênios/planos, tabelas (TUSS/CBHPM/AMB/SUS), unidades, setores, leitos, salas |
| 2 | **Agendamento** | Consultas, exames e cirurgias; agenda inteligente; teleconsulta; encaixe; bloqueios; painel de chamada; totem |
| 3 | **Recepção e Atendimento** | Registro, elegibilidade, autorização, classificação de risco, fila |
| 4 | **Pronto Atendimento** | Urgência/emergência; observação; alta ou internação |
| 5 | **Internação e Gestão de Leitos** | Solicitação, alocação, mapa, transferência, alta, taxa de ocupação |
| 6 | **PEP** | Anamnese, evolução multiprofissional, prescrições, exames, atestados, assinatura digital |
| 7 | **Farmácia** | Dispensação por turno, farmácia clínica, controlados, painel, conversão de unidades |
| 8 | **Centro Cirúrgico** | Agendamento, mapa de salas, kits, gabaritos, registro, ficha anestésica, OPME |
| 9 | **CME** | Esterilização, rastreabilidade, indicadores biológicos |
| 10 | **Unidade de Diagnóstico** | Laboratório, imagem, central de laudos, lab. de apoio, sinônimos, instruções |
| 11 | **CCIH** | Casos de infecção, cruzamento paciente×local×prontuário, indicadores |
| 12 | **Faturamento** | TISS (XML), SUS (BPA/AIH/APAC), particular, pacotes, condições contratuais |
| 13 | **Gestão de Glosas** | Recebimento, recurso, acompanhamento, perdas |
| 14 | **Repasse Médico** | Critérios, folha de produção, apuração, liberação |
| 15 | **Tesouraria/Caixa** | Recebimentos, integração com Fluxus/financeiro |
| 16 | **Gestão de Custos** | Custo por paciente, procedimento, convênio, centro de custo |
| 17 | **SAME** | Arquivo, localização, empréstimo, digitalização |
| 18 | **Visitantes** | Entrada/saída, restrições, rastreabilidade |
| 19 | **Portais** | Médico (laudos, agenda, produtividade) e Paciente (resultados, agendamento, teleconsulta) |
| 20 | **Indicadores e BI** | Dashboards executivos |
| 21 | **Integrações** | Backoffice (RM/ERP), TISS, SUS, Anestech, labs externos, IA, assinatura digital |

> A modelagem de dados de cada módulo está em `DB.md` §7. As regras de negócio estão em `docs/03-regras-negocio.md`.

---

## 4. Conceitos fundamentais

### 4.1 Paciente
Cadastro central com dados pessoais (CPF, CNS, RG), endereço, contatos, alergias, comorbidades, convênios vinculados (1:N), histórico de atendimentos. **Único por CPF dentro do tenant**.

### 4.2 Prestador
Profissional de saúde com conselho (CRM/COREN/CRF/CRN/etc.), especialidades CBOS, vínculo (CLT, plantonista, cooperado, terceiro), regras de repasse e dados bancários.

### 4.3 Convênio
Operadora de plano de saúde. Possui múltiplos planos, condições contratuais versionadas, tabelas de preços vinculadas, parâmetros TISS específicos.

### 4.4 Atendimento
**Evento clínico raiz** (consulta, exame, internação, cirurgia, PA, teleconsulta) que:
- Tem um paciente, um prestador responsável e um setor.
- Define tipo de cobrança (particular/convênio/SUS).
- Gera **uma conta** para faturamento (1:1).
- Agrega evoluções, prescrições, solicitações de exame, dispensações, cirurgias.

### 4.5 Conta do Paciente
Consolidação de **todos os gastos** de um atendimento, distribuídos em **grupos de gasto**:
- PROCEDIMENTO, DIARIA, TAXA, SERVICO, MATERIAL, MEDICAMENTO, OPME, GAS, PACOTE, HONORARIO.

A conta passa pelos status: `ABERTA → EM_ELABORACAO → FECHADA → FATURADA → (GLOSADA_PARCIAL/TOTAL) → PAGA`.

### 4.6 TISS / TUSS
- **TISS** (Troca de Informações em Saúde Suplementar): padrão XML da ANS para troca prestador-operadora. Versões em uso: 4.x.
- **Guias TISS**: SP/SADT, Internação, Honorários, Outras Despesas, Resumo de Internação, Anexo OPME, Consulta.
- **TUSS** (Terminologia Unificada da Saúde Suplementar): códigos de procedimentos, materiais e medicamentos.

### 4.7 Grupo de Gasto
Classificação do item para fins de faturamento e relatório de custo. Determinante para regras de cobertura, glosa e repasse.

### 4.8 Unidade de Faturamento × Unidade de Atendimento
- **U. Faturamento**: divisão do hospital para emissão de guias (Ambulatório, PS, Internação, CC).
- **U. Atendimento**: agrupamento operacional/contábil. Pode coincidir com a de faturamento ou ser mais granular.

### 4.9 Elaboração de Contas
Processo de revisão da conta antes do envio: confere autorizações, aplica tabela de preços vigente, monta pacotes, valida quantidades, marca itens auditáveis. **Bloqueia fechamento** se houver inconsistências.

### 4.10 Glosa
Recusa total ou parcial pela operadora de um item faturado. Pode ser **eletrônica (TISS)** ou **manual**. Cada glosa tem ciclo: `RECEBIDA → EM_RECURSO → ACATADA / REVERTIDA / PERDA_DEFINITIVA`.

### 4.11 Repasse Médico
Pagamento ao médico não-CLT pelos serviços prestados. Calculado por **critérios flexíveis** (%, valor fixo) sobre **base de cálculo** (valor total, com deduções, com acréscimos). Frequência: ao faturar, ao confirmar recebimento ou prazo definido.

### 4.12 Classificação de Risco (Triagem)
Protocolo Manchester (ou similar) por **cores**:

| Cor | Gravidade | Tempo-alvo |
|:-:|:-:|---|
| 🔴 Vermelho | Emergência | Imediato |
| 🟠 Laranja | Muito urgente | 10 min |
| 🟡 Amarelo | Urgente | 60 min |
| 🟢 Verde | Pouco urgente | 120 min |
| 🔵 Azul | Não urgente | 240 min |

### 4.13 OPME
Órtese, Prótese e Materiais Especiais. Sempre exige autorização prévia, lote, registro ANVISA, fabricante, rastreabilidade.

### 4.14 PEP
Prontuário Eletrônico do Paciente. **Multiprofissional**: médico, enfermeiro, nutricionista, fisioterapeuta, psicólogo, farmacêutico, fonoaudiólogo, etc. registram em seus contextos.

---

## 5. Visão lógica em camadas

```
┌──────────────────────────────────────────────────────────┐
│  Apresentação        React (web), React Native (mobile)   │
│  Portais             Médico, Paciente                     │
├──────────────────────────────────────────────────────────┤
│  API REST/WebSocket  NestJS (núcleo)                      │
│  Microsserviço IA    FastAPI (OCR/NLP)                    │
├──────────────────────────────────────────────────────────┤
│  Domain              Entidades, regras, eventos           │
│  Application         Use cases, orquestração              │
├──────────────────────────────────────────────────────────┤
│  Infrastructure      Prisma + PostgreSQL                  │
│                      Redis (cache + filas + streams)      │
│                      S3-compat (arquivos: PDF, DICOM)     │
├──────────────────────────────────────────────────────────┤
│  Integrações         TISS (ANS), DATASUS, ICP-Brasil,     │
│                      Anestech, RM/Backoffice, IA          │
└──────────────────────────────────────────────────────────┘
```

Detalhamento em `ARCHITECTURE.md`.

---

## 6. Premissas e restrições

### 6.1 Premissas
- O hospital tem internet estável o suficiente para WebSocket (mapa de leitos).
- O hospital opera fuso UTC-3 (Brasília); fuso configurável por tenant.
- O hospital aceita SaaS multi-tenant compartilhado (com RLS) ou pode requerer instância dedicada.
- O hospital fornece certificados ICP-Brasil (A1/A3) para médicos e laudistas.

### 6.2 Restrições
- **LGPD**: dado de saúde é dado pessoal sensível (Art. 5º, II e Art. 11). Toda operação registra finalidade, tem trilha de acesso, e pode ser excluída a pedido (com restrições legais por norma médica de retenção de prontuário — 20 anos pelo CFM).
- **ANS**: padrão TISS é mandatório para convênios. Versão atualizada periodicamente.
- **CFM Resolução 1.638/2002**: prontuário deve ser íntegro, autêntico, sigiloso, perene e em meio que assegure recuperação.
- **MS Portaria 344/1998**: medicamentos controlados exigem livro próprio e receitas específicas (A1/A2/A3, B1/B2, C1).

---

## 7. Não-objetivos (escopo fora)

Para evitar escopo creep, o HMS-BR **não cobre**:
- Gestão de RH/Folha (integra com sistema externo).
- Compras/Estoque/Financeiro/Contábil (integra com RM ou ERP equivalente).
- PACS DICOM completo (integra com PACS dedicado; armazena referências e laudos).
- Ambulâncias/SAMU (módulo específico, futuro).
- Banco de Sangue/Hemocentro (módulo específico, futuro).
- Pesquisa Clínica/CEP (módulo específico, futuro).
- Telemedicina remota a hospitais parceiros (apenas teleconsulta paciente→médico do próprio hospital).

---

## 8. Próximos passos

Após ler este documento, prossiga para:
- `docs/02-modelo-dados.md` — visão de modelo (resumo do `DB.md`).
- `docs/03-regras-negocio.md` — regras detalhadas por contexto.
- `docs/04-fluxos-processo.md` — diagramas de fluxo.
