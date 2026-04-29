# 09 — Glossário

> Termos de domínio (saúde, regulatório, técnico) usados em todo o sistema.
> Consulte ao encontrar siglas. Atualize ao introduzir novos termos.

---

## A

**ABAC** (Attribute-Based Access Control) — Controle de acesso baseado em atributos. Complementa o RBAC quando uma permissão depende de contexto (ex.: médico só vê pacientes do seu setor).

**AIH** (Autorização de Internação Hospitalar) — Documento do SUS que autoriza internação. Layout específico, geração mensal por competência.

**Alta a pedido** — Saída do paciente contra recomendação médica, com documento TALD assinado.

**Análise farmacêutica** — Revisão de prescrição por farmacêutico antes da dispensação. Pode aprovar, aprovar com ressalvas ou recusar.

**Anestech** — Sistema de monitoramento anestésico integrável ao Centro Cirúrgico. Pode substituir a ficha anestésica manual.

**ANS** (Agência Nacional de Saúde Suplementar) — Reguladora dos planos de saúde no Brasil. Mantém o padrão TISS e o registro ANS dos convênios.

**ANVISA** — Agência Nacional de Vigilância Sanitária. Registro de medicamentos e materiais OPME.

**APAC** (Autorização de Procedimentos de Alta Complexidade/Custo) — SUS. Procedimentos como hemodiálise, quimioterapia.

**Apuração de repasse** — Cálculo mensal dos valores devidos a cada prestador conforme critérios.

**Atendimento** — Evento clínico raiz no sistema (consulta, exame, internação, cirurgia, PA). Tem 1:1 com Conta.

**Auditoria de contas** — Análise de contas hospitalares por auditor (interno ou da operadora) para identificar inconsistências, glosar.

---

## B

**BPA** (Boletim de Produção Ambulatorial) — SUS. Apresenta produção ambulatorial em duas modalidades: BPA-C (consolidado) e BPA-I (individualizado).

**BullMQ** — Fila baseada em Redis usada para jobs assíncronos.

---

## C

**CBHPM** (Classificação Brasileira Hierarquizada de Procedimentos Médicos) — Tabela da AMB com códigos, portes e valores de procedimentos.

**CBO** (Classificação Brasileira de Ocupações) — Códigos do MTE para profissões. Usado em CBOS.

**CBOS** — Subset de CBOs aplicáveis à saúde, usado em prestadores e especialidades.

**CCIH** (Comissão de Controle de Infecção Hospitalar) — Setor que monitora IRAS (infecções).

**CFM** — Conselho Federal de Medicina. Resoluções relevantes: 1.638/2002 (prontuário).

**CID-10** — Classificação Internacional de Doenças, 10ª edição (OMS).

**CME** (Central de Material Esterilizado) — Setor que limpa, prepara, esteriliza e distribui materiais.

**CNES** (Cadastro Nacional de Estabelecimentos de Saúde) — Identificador do estabelecimento perante a ANS/SUS.

**CNS** (Cartão Nacional de Saúde) — Identificador único do cidadão no SUS.

**Compromisso por turno** — Padrão de farmácia: dispensação se faz por turnos (manhã, tarde, noite, madrugada).

**Conta** — Consolidação financeira de um atendimento. Tem itens, totais, status. 1:1 com atendimento.

**Convênio** — Operadora de plano de saúde.

**CRBM** — Conselho Regional de Biomedicina.

**CRF** — Conselho Regional de Farmácia.

**CRM** — Conselho Regional de Medicina.

**CRN** — Conselho Regional de Nutricionistas.

**CREFITO** — Conselho Regional de Fisioterapia e Terapia Ocupacional.

**CRO** — Conselho Regional de Odontologia.

**CRP** — Conselho Regional de Psicologia.

---

## D

**DATASUS** — Departamento de Informática do SUS. Disponibiliza tabelas (CID-10, CBO).

**DECIMAL(18,4)** — Tipo numérico exato com 14 dígitos antes da vírgula e 4 depois. Usado para R$.

**DECIMAL(18,6)** — Idem mas com 6 casas decimais. Usado para quantidades de medicamentos.

**Diária** — Cobrança do dia de internação (acomodação). Varia por tipo (apartamento, enfermaria, UTI).

**Diff (em auditoria)** — Estrutura JSONB com `{antes, depois}` capturada por trigger.

**Dispensação** — Entrega de medicamento/material pela farmácia ao setor/paciente.

**DPO** (Data Protection Officer) — Encarregado pelo tratamento de dados (LGPD).

**DTA Vision** — Inteligência artificial para leitura de documentos na admissão (parte do TOTVS Saúde, replicada via microsserviço IA).

---

## E

**Elaboração de contas** — Processo de revisão da conta antes de fechar e gerar TISS.

**ENUM (Postgres)** — Tipo de dado restrito a valores predefinidos.

**Encaixe** — Agendamento que viola a regra de não-sobreposição, justificado e marcado com flag.

**EPL** — não aplicável aqui (futebol). Ignorar.

**Especialidade** — Área médica reconhecida (ex.: Cardiologia, Pediatria). Pode ter RQE (Registro de Qualificação de Especialista).

**Evolução** — Registro periódico do paciente no PEP. Multiprofissional.

**Evasão** — Tipo de alta: paciente saiu sem autorização médica.

**EXCLUDE constraint** — Constraint do PostgreSQL que rejeita inserções/updates que conflitem com linhas existentes segundo um operador (`&&` para overlap em range).

**Expand-contract** — Padrão de migration que adiciona estrutura nova sem remover a antiga, faz backfill, depois remove.

---

## F

**Faturamento** — Processo de cobrar pelos serviços prestados (TISS para convênio, BPA/AIH/APAC para SUS, recibo/boleto para particular).

**FHIR** (Fast Healthcare Interoperability Resources) — Padrão internacional de interoperabilidade em saúde. Usado para portabilidade LGPD.

**Ficha anestésica** — Documento detalhando procedimento anestésico em cirurgia.

**Ficha cirúrgica** — Documento detalhando procedimento cirúrgico.

**Folha de produção** — Relatório de itens executados por um prestador em um período.

**Fluxus** — Sistema financeiro/contábil da TOTVS, integrável.

---

## G

**Gabarito (Caderno de gabarito)** — Lista de materiais/medicamentos previstos para um procedimento cirúrgico, podendo variar por cirurgião.

**GIN index** — Generalized Inverted Index. Usado para JSONB e busca textual.

**Gist index** — Generalized Search Tree. Usado para EXCLUDE constraints com tsrange.

**Glosa** — Recusa total ou parcial de pagamento por uma operadora. Pode ser eletrônica (TISS) ou manual.

**Grupo de Gasto** — Classificação do item para faturamento e custo: PROCEDIMENTO, DIARIA, TAXA, SERVICO, MATERIAL, MEDICAMENTO, OPME, GAS, PACOTE, HONORARIO.

**Guia TISS** — Documento eletrônico para troca prestador-operadora. Tipos: SP/SADT, Internação, Honorários, Outras Despesas, Resumo de Internação, Anexo OPME, Consulta.

---

## H

**HMS-BR** — Hospital Management System Brasileiro (este projeto).

**Honorário** — Valor devido ao prestador (médico, anestesista) por procedimento. Calculado em repasse.

**Hospital com fins lucrativos / sem fins lucrativos** — Distinção tributária e contratual.

---

## I

**ICP-Brasil** (Infraestrutura de Chaves Públicas Brasileira) — Sistema oficial de assinatura digital. Certificados A1 (arquivo) e A3 (token/cartão).

**IDempotência** — Operação que produz o mesmo resultado quando executada múltiplas vezes com mesma entrada.

**IRAS** (Infecção Relacionada à Assistência à Saúde) — Antiga "infecção hospitalar".

**ISS** — Imposto Sobre Serviço. Alíquota varia por município.

---

## J

**JSONB** — Tipo binário JSON do PostgreSQL. Permite indexação e queries.

**JWT** (JSON Web Token) — Token de autenticação assinado.

---

## K

**KMS** (Key Management Service) — Serviço de gerenciamento de chaves criptográficas (AWS KMS, GCP KMS, etc.).

---

## L

**LGPD** (Lei Geral de Proteção de Dados) — Lei brasileira nº 13.709/2018. Dados de saúde são sensíveis (Art. 11).

**Lote TISS** — Conjunto de guias TISS enviadas em um arquivo XML por convênio + competência.

**Livro de controlados** — Registro obrigatório de medicamentos da Portaria 344/1998 (psicotrópicos, entorpecentes).

---

## M

**Manchester (Triagem de Manchester)** — Protocolo de classificação de risco em PA, com 5 cores.

**Mapa de leitos** — Visualização em tempo real do status de cada leito do hospital.

**MFA** (Multi-Factor Authentication) — Autenticação com mais de um fator.

**Migration (Prisma/SQL)** — Script versionado de mudança de schema.

**MS** (Ministério da Saúde) — Órgão regulador do SUS.

---

## N

**NCM** — Nomenclatura Comum do Mercosul (não usado em saúde direta, mas aparece em materiais).

**No-show** — Paciente que não compareceu ao agendamento.

---

## O

**OAuth/OpenID Connect** — Protocolos de autenticação federada. Não usados na v1.

**Óbito** — Tipo de alta. Exige declaração de óbito, CID, data, causa.

**ODBC** — Não usado aqui (legado).

**OPME** (Órtese, Prótese e Materiais Especiais) — Materiais de alto custo, exigem autorização e rastreabilidade.

**Outbox pattern** — Padrão de publicação confiável de eventos: insere na mesma transação + worker publica.

---

## P

**Pacote** — Cobrança fechada por procedimento principal (substitui cobrança item-a-item dentro do escopo).

**PA** (Pronto Atendimento) ou **PS** (Pronto Socorro) — Setor de urgência/emergência.

**PACS** (Picture Archiving and Communication System) — Sistema de armazenamento de imagens DICOM.

**Particionamento** — Divisão de tabela em partições (range, list, hash). Usado para evolucoes/prescricoes/dispensacoes (range mensal).

**Particular** — Tipo de cobrança: paciente paga direto.

**PEP** (Prontuário Eletrônico do Paciente) — Conjunto de registros clínicos do paciente (evoluções, prescrições, exames, documentos).

**PHI** (Protected Health Information) — Informação de saúde protegida (terminologia HIPAA, similar à LGPD).

**Plano (de saúde)** — Sub-categoria de um convênio com cobertura específica.

**Portaria 344/1998** — Regulamenta medicamentos controlados no Brasil.

**Prescrição** — Receita médica (medicamentos, cuidados, dieta, procedimentos, exames).

**Prestador** — Profissional de saúde (médico, enfermeiro, etc.). Tem conselho, especialidade, vínculo.

**Prisma** — ORM TypeScript usado pela aplicação.

**Procedimento** — Ação clínica catalogada (TUSS, CBHPM, AMB, SUS) com código.

**Prontuário** — Conjunto de registros do paciente.

---

## Q

(termo não relevante no contexto)

---

## R

**RBAC** (Role-Based Access Control) — Controle de acesso por papel (perfil).

**Recurso de glosa** — Contestação formal de uma glosa pelo prestador.

**Repasse** — Pagamento ao prestador (não-CLT) pelos serviços prestados.

**RLS** (Row Level Security) — Mecanismo do PostgreSQL para filtrar linhas por política. Usado em multi-tenant.

**RM (Linha RM)** — Família de produtos da TOTVS para gestão hospitalar e ERP. O HMS-BR é inspirado no módulo Saúde Hospitais e Clínicas.

**RPO** (Recovery Point Objective) — Quanto de dado pode ser perdido em caso de desastre (15min).

**RTO** (Recovery Time Objective) — Quanto tempo o sistema pode ficar fora (4h).

**RQE** — Registro de Qualificação de Especialista do CFM.

---

## S

**SAME** (Serviço de Arquivo Médico e Estatística) — Setor que arquiva prontuários físicos.

**SaaS** (Software as a Service) — Modelo de oferta multi-tenant.

**Senha de autorização** — Código fornecido pela operadora para autorizar procedimento.

**Setor** — Divisão organizacional do hospital (UTI, PA, ambulatório, CC, etc.).

**Sinais vitais** — PA, FC, FR, T°, SatO₂, peso, altura, glicemia.

**Snapshot** — Cópia em determinado momento, gravada para preservar contexto histórico.

**Soft-delete** — Marca como excluído sem apagar fisicamente (preserva histórico).

**SOS** — Termo médico para "se necessário". Item de prescrição executado sob demanda.

**SP/SADT** — Tipo de guia TISS para Solicitação de Procedimentos / Serviço Auxiliar de Diagnóstico e Terapia.

**SUS** (Sistema Único de Saúde) — Sistema público brasileiro.

---

## T

**TALD** (Termo de Alta a Pedido) — Documento assinado pelo paciente que se recusa a continuar internado.

**Tabela de preços** — Lista de procedimentos com valores acordados por convênio.

**Tabela TISS** — Códigos de tabela usados no padrão (22 = TUSS, 18, 19, 20, 98, 00).

**Telemedicina / Teleconsulta** — Atendimento remoto. CFM regulamenta.

**Tenant** — Instância lógica multi-cliente (um hospital ou rede).

**TIC (em saúde)** — Tecnologia da Informação em Comunicação.

**TIMESTAMPTZ** — Timestamp com fuso horário no PostgreSQL.

**TipTap** — Editor rich text usado no PEP.

**TISS** (Troca de Informações em Saúde Suplementar) — Padrão da ANS para comunicação entre prestador e operadora. Versões 4.x.

**Triagem** — Avaliação inicial em PA com classificação de risco.

**Trigger (Postgres)** — Função executada automaticamente em INSERT/UPDATE/DELETE.

**TUSS** (Terminologia Unificada da Saúde Suplementar) — Códigos padronizados de procedimentos, materiais e medicamentos. Tabela 22 do TISS.

---

## U

**Unidade de Atendimento** — Agrupamento operacional do hospital (mais granular que U. Faturamento).

**Unidade de Faturamento** — Divisão para emissão de guias TISS (ex.: Ambulatório, PS, Internação, CC).

**UUID** — Identificador único universal. Usado externamente para entidades (`uuid_externo`).

---

## V

**Versão (otimistic locking)** — Coluna `versao INT` incrementada a cada update; permite detectar alterações concorrentes.

**Visitante** — Pessoa que visita paciente internado. Tem cadastro próprio.

---

## W

**Webhook** — Endpoint que recebe notificações de sistemas externos (TISS retorno, lab apoio, financeiro).

**WebSocket** — Conexão persistente para tempo real (mapa de leitos, painel farmácia).

---

## X

**XSD** — XML Schema Definition. Usado para validar XMLs TISS antes de envio.

---

## Y, Z

(termos não relevantes)

---

## Siglas técnicas (resumo)

| Sigla | Termo |
|---|---|
| API | Application Programming Interface |
| CI/CD | Continuous Integration / Continuous Delivery |
| CRUD | Create, Read, Update, Delete |
| DI | Dependency Injection |
| DDD | Domain-Driven Design |
| DTO | Data Transfer Object |
| HMR | Hot Module Replacement |
| ORM | Object-Relational Mapping |
| OTP | One-Time Password |
| PR | Pull Request |
| TLS | Transport Layer Security |
| TOTP | Time-based One-Time Password |
| WCAG | Web Content Accessibility Guidelines |
