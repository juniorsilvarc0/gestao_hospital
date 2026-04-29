# 03 — Regras de Negócio

> Regras numeradas e rastreáveis. Toda história/PR deve referenciar `RN-XXX-NN`.
> Quando uma regra for implementada, marcar com `✅` no PR.

---

## Convenção de identificadores

`RN-<CTX>-<NN>` onde CTX é:

| Sigla | Contexto |
|---|---|
| ATE | Atendimento, recepção, triagem |
| PEP | Prontuário eletrônico |
| PRE | Prescrição |
| FAR | Farmácia, dispensação, controlados |
| CC  | Centro cirúrgico |
| AGE | Agendamento |
| FAT | Faturamento, conta, TISS |
| GLO | Glosa |
| REP | Repasse médico |
| CME | Esterilização |
| CCI | CCIH |
| SAM | SAME |
| VIS | Visitantes |
| LGP | LGPD/Auditoria |
| SEG | Segurança/Auth |

---

## ATE — Atendimento, Recepção, Triagem

**RN-ATE-01** — Todo paciente deve possuir CPF **OU** CNS válidos para ser atendido. Recém-nascido sem CPF é registrado vinculado à mãe (`paciente_pai/mae`) com `cpf` opcional até regularização.

**RN-ATE-02** — A elegibilidade do convênio deve ser consultada (online se webservice disponível, manual caso contrário) **antes** de iniciar o atendimento. Resultado fica registrado em `atendimentos.observacao` com timestamp.

**RN-ATE-03** — Se o procedimento exige autorização prévia (`tabelas_procedimentos.precisa_autorizacao = TRUE`), o atendimento só pode prosseguir com `senha_autorizacao` registrada **OU** com flag explícita "atendimento de urgência" justificada.

**RN-ATE-04** — Classificação de risco (Manchester) é obrigatória para Pronto Atendimento. Sem cor, paciente não pode ser encaminhado a consultório.

**RN-ATE-05** — A ordem de atendimento na fila é determinada por: (1) cor da triagem (vermelho > laranja > amarelo > verde > azul); (2) tempo de espera. Encaixe permite override com justificativa registrada.

**RN-ATE-06** — Cancelamento de atendimento agendado dentro de 4 horas da hora marcada exige justificativa e gera notificação ao paciente e ao prestador.

**RN-ATE-07** — Atendimento em status `EM_ATENDIMENTO` não pode receber novos itens de prescrição/exame após `data_hora_saida` ser preenchida.

**RN-ATE-08** — Transferência interna (entre setores) preserva o mesmo `atendimento_id` mas registra evento de transferência em `auditoria_eventos`. Transferência externa cria novo atendimento com `atendimento_origem_id` apontando para o anterior.

---

## PEP — Prontuário Eletrônico

**RN-PEP-01** — Toda evolução deve ser registrada no contexto de um atendimento ativo (não fechado).

**RN-PEP-02** — Evolução só é considerada **válida** após assinatura digital (ICP-Brasil A1/A3) — campo `assinada_em` preenchido.

**RN-PEP-03** — Após assinatura, a evolução é **imutável**. Correção exige nova evolução do tipo `RETIFICACAO` referenciando a anterior em `versao_anterior_id`. A anterior **não** é apagada — fica visível com tarja "RETIFICADA".

**RN-PEP-04** — Sinais vitais devem ser validados contra faixas fisiológicas (FC 30-220, PA sist. 50-280, etc.). Valor fora da faixa é aceito apenas com checkbox "valor confirmado pelo profissional".

**RN-PEP-05** — Prescrição não pode ser emitida se o paciente apresenta alergia documentada ao princípio ativo. Override exige justificativa do prescritor + alerta visual permanente na ficha.

**RN-PEP-06** — Interações medicamentosas críticas (severidade alta) bloqueiam a prescrição até confirmação explícita do prescritor com justificativa.

**RN-PEP-07** — Acesso a prontuário **por outro setor** que não o de atendimento atual exige finalidade explícita registrada em `acessos_prontuario.finalidade` (LGPD).

**RN-PEP-08** — Nota de admissão é obrigatória nas primeiras 24 horas de uma internação.

**RN-PEP-09** — Resumo de alta é obrigatório no momento da alta (antes de mudar status para `ALTA`).

**RN-PEP-10** — Profissionais de fora da equipe podem visualizar o prontuário em modo somente-leitura quando convocados para parecer/interconsulta. Ação registra acesso em `acessos_prontuario`.

---

## PRE — Prescrição

**RN-PRE-01** — Prescrição passa por **análise farmacêutica** antes da dispensação. Status inicial: `AGUARDANDO_ANALISE`. Após análise: `ATIVA` (aprovada), `RECUSADA_FARMACIA` (com parecer obrigatório) ou `APROVADA_RESSALVAS`.

**RN-PRE-02** — Item de prescrição com `urgente = TRUE` aciona alerta no painel de farmácia (notificação em tempo real).

**RN-PRE-03** — Medicamentos da Portaria 344/1998 (controlados) exigem receita digital com numeração sequencial e ficam registrados no `livro_controlados`. Sem isso → bloqueio de dispensação.

**RN-PRE-04** — Reaprazamento (mudança de horários) é evento separado e registrado. Mantém o mesmo item, gera log.

**RN-PRE-05** — Suspensão de item exige justificativa. Trigger registra em `auditoria_eventos`.

**RN-PRE-06** — Prescrição encerrada ao fim da validade (`validade_fim`) ou na alta do paciente (o que ocorrer primeiro).

**RN-PRE-07** — Dose máxima diária é validada antes da assinatura. Override exige justificativa do prescritor.

**RN-PRE-08** — Prescrição composta (mais de um item correlacionado, ex.: dieta + restrição hídrica + medicação) trata os itens como conjunto. Cancelar um exige decisão sobre os outros.

---

## FAR — Farmácia / Dispensação / Controlados

**RN-FAR-01** — Dispensação só ocorre contra prescrição com status `ATIVA` ou `APROVADA_RESSALVAS`.

**RN-FAR-02** — Cada dispensação registra: lote, validade, paciente, atendimento, prescrição, prescritor, farmacêutico, turno, quantidade prescrita vs quantidade dispensada.

**RN-FAR-03** — Conversão de unidade prescrita → unidade dispensada usa `tabelas_procedimentos.fator_conversao`. Discrepância em `quantidade_dispensada` ≠ `quantidade_prescrita * fator` exige justificativa (ex.: ampola não fracionada).

**RN-FAR-04** — Devolução de medicamento é evento separado, gera reposição de estoque e crédito no `contas_itens` se já lançado.

**RN-FAR-05** — Medicamento controlado dispensado: gera entrada automática no `livro_controlados` com saldo recalculado. Saldo negativo = bloqueio total da dispensação até auditoria.

**RN-FAR-06** — Kit cirúrgico dispensado para sala é evento de massa: dispensação tipo `KIT_CIRURGICO` lançada com referência à cirurgia. Devolução parcial gera evento de devolução por item.

**RN-FAR-07** — Dispensação automática mediante prescrição assinada exige flag de configuração do hospital. Default: dispensação manual (operador clica "dispensar").

**RN-FAR-08** — Painel de farmácia mostra prescrições por turno (manhã, tarde, noite, madrugada). Item dispensado some do painel ou muda para "DISPENSADO" conforme config.

---

## CC — Centro Cirúrgico

**RN-CC-01** — Cirurgia agendada exige sala disponível (constraint `EXCLUDE` impede sobreposição) e equipe completa (cirurgião obrigatório, demais conforme procedimento).

**RN-CC-02** — Cirurgia eletiva exige autorização prévia do convênio quando o procedimento principal exige.

**RN-CC-03** — OPME solicitada → autorização → utilização: fluxo controlado. **Não pode** usar OPME sem autorização registrada (exceto urgência com justificativa).

**RN-CC-04** — Ficha cirúrgica e ficha anestésica são obrigatórias para encerrar cirurgia (status `CONCLUIDA`).

**RN-CC-05** — Início real da cirurgia (`data_hora_inicio`) só pode ser registrado com paciente fisicamente na sala (confirmação operacional).

**RN-CC-06** — Materiais utilizados (gabarito + extras) geram automaticamente itens em `contas_itens` na conta do atendimento.

**RN-CC-07** — Cancelamento de cirurgia em andamento exige justificativa e registro em prontuário.

**RN-CC-08** — Equipe cirúrgica gera repasses automáticos conforme `criterios_repasse` por função (cirurgião, auxiliar, anestesista, instrumentador).

---

## AGE — Agendamento

**RN-AGE-01** — Agendamento sobre recurso (médico/sala/equipamento) **não pode sobrepor** outro agendamento vigente (constraint EXCLUDE no banco). Encaixe é exceção explícita com flag.

**RN-AGE-02** — Bloqueio de agenda (férias, congresso) impede novos agendamentos. Agendamentos pré-existentes ficam mantidos com alerta.

**RN-AGE-03** — Confirmação automática 24h antes via SMS/e-mail/push. Sem resposta = status mantido como `AGENDADO` (não cancela automático).

**RN-AGE-04** — No-show (`FALTOU`) é registrado e somado em métrica do paciente. Alerta a partir de 3 ocorrências.

**RN-AGE-05** — Teleconsulta gera link único (`agendamentos.link_teleconsulta`) válido apenas no intervalo da consulta ± 30 min.

**RN-AGE-06** — Encaixe respeita restrição: não pode haver mais que N encaixes por dia por prestador (config). Default N=2.

---

## FAT — Faturamento e TISS

**RN-FAT-01** — Conta só pode ser **fechada** após:
- todos os itens conferidos (`autorizado` resolvido),
- elaboração concluída (status passa por `EM_ELABORACAO`),
- snapshots de tabela de preços e condição contratual gravados,
- sem inconsistências bloqueantes.

**RN-FAT-02** — Mudança de tabela de preços ou condição contratual **após** o fechamento da conta **não** afeta a conta — snapshots prevalecem.

**RN-FAT-03** — Geração de guia TISS valida XML contra XSD da versão TISS vigente. **Erro de XSD bloqueia o lote inteiro** até correção.

**RN-FAT-04** — Lote TISS gerado é hashado (SHA-256). Reenvio (após correção) cria novo lote referenciando o anterior em `lotes_tiss.lote_anterior_id`.

**RN-FAT-05** — Pacotes (cobrança fechada por procedimento principal) excluem cobrança individual de itens contidos. Itens **fora do pacote** podem ser cobrados separadamente com flag `fora_pacote = TRUE`.

**RN-FAT-06** — Item lançado manualmente em conta exige justificativa e usuário responsável (auditoria).

**RN-FAT-07** — Recálculo de conta exige `operacao_id` UUID para idempotência. Mesma `operacao_id` em retry não duplica.

**RN-FAT-08** — SUS: BPA-C, BPA-I, AIH e APAC seguem layouts próprios. Geração mensal por competência. Estrutura espelhada em `lotes_sus` (extensão futura).

**RN-FAT-09** — Particular: emissão de boleto/recibo após pagamento. Integração com gateway financeiro (RM ou similar).

**RN-FAT-10** — ISS é destacado conforme `condicoes_contratuais.iss_aliquota`. Retenção é responsabilidade do convênio quando `iss_retem = TRUE`.

---

## GLO — Gestão de Glosas

**RN-GLO-01** — Glosa eletrônica (recebida via TISS) é importada e vinculada à conta/item correspondente. Sem item → fica em "glosa de conta" geral.

**RN-GLO-02** — Glosa manual (lançada pelo faturista) exige motivo, valor e responsável.

**RN-GLO-03** — Recurso de glosa tem prazo conforme contrato (default 30 dias). Sistema alerta vencimento próximo (D-7, D-3, D-0).

**RN-GLO-04** — Recurso aceito (`REVERTIDA_TOTAL` ou `REVERTIDA_PARCIAL`) atualiza `valor_recurso_revertido` na conta e dispara reapuração de repasse vinculado.

**RN-GLO-05** — Perda definitiva (`PERDA_DEFINITIVA`) afeta indicador de inadimplência por convênio. Notifica gestão.

**RN-GLO-06** — Glosa por divergência de tabela: o sistema sugere automaticamente o motivo provável (preço, código, autorização) com base na guia.

**RN-GLO-07** — Toda glosa gera evento `GlosaRecebida` consumido por: faturamento (atualiza valores), repasse (recalcula), BI (KPI).

---

## REP — Repasse Médico

**RN-REP-01** — Repasse só inclui prestadores com `recebe_repasse = TRUE` e que não sejam CLT (CLT recebe via folha externa).

**RN-REP-02** — Apuração mensal por competência (AAAA-MM) consolida itens das contas faturadas no período.

**RN-REP-03** — Critério de repasse aplicado é o **vigente na data de realização** do item, não na data de apuração. (Snapshot necessário.)

**RN-REP-04** — Base de cálculo configurada (`enum_repasse_tipo_base_calculo`):
- `VALOR_TOTAL`: valor cheio do item.
- `VALOR_COM_DEDUCOES`: subtrai glosas conhecidas.
- `VALOR_COM_ACRESCIMOS`: soma juros, multas.
- `VALOR_LIQUIDO_PAGO`: valor efetivamente recebido do convênio.

**RN-REP-05** — Repasse só é **liberado** após conferência. Status: `APURADO → CONFERIDO → LIBERADO → PAGO`.

**RN-REP-06** — Cancelamento de pagamento de glosa após repasse pago gera **estorno** registrado como `repasses_itens.glosado = TRUE` no próximo ciclo.

**RN-REP-07** — Adiantamento de repasse (mediante solicitação) é apenas informativo no sistema; pagamento ocorre fora (financeiro).

**RN-REP-08** — Cooperados/sócios têm regras especiais de partilha que podem incluir múltiplos prestadores em um mesmo item (ex.: cirurgião + auxiliar fixos).

---

## CME — Esterilização

**RN-CME-01** — Lote de esterilização exige **indicador biológico** confirmado para liberação.

**RN-CME-02** — Artigo só sai do CME para uso após etapa `GUARDA` confirmada.

**RN-CME-03** — Falha em indicador → lote inteiro é descartado/reesterilizado e os artigos não podem ser usados.

**RN-CME-04** — Validade do lote é monitorada; expiração gera necessidade de reesterilização.

**RN-CME-05** — Rastreabilidade: artigo usado em cirurgia é vinculado ao paciente. Auditoria pós-evento (infecção, alerta sanitário) consegue regredir até o lote.

---

## CCI — CCIH

**RN-CCI-01** — Caso de IRAS (Infecção Relacionada à Assistência à Saúde) cruza paciente × leito × prontuário automaticamente para identificar contatos de risco.

**RN-CCI-02** — Resistência microbiológica (antibiograma) é registrada e alimenta painel epidemiológico.

**RN-CCI-03** — Notificação de doenças compulsórias (lista MS) gera alerta ao gestor CCIH.

**RN-CCI-04** — Indicadores: taxa de IRAS por setor, taxa de uso de antibióticos, perfil de resistência. Calculados em job mensal e expostos no BI.

---

## SAM — SAME

**RN-SAM-01** — Empréstimo de prontuário físico exige solicitante identificado e prazo de devolução.

**RN-SAM-02** — Atraso na devolução (>30 dias) gera notificação ao supervisor.

**RN-SAM-03** — Digitalização cria PDF anexado ao paciente e flag `digitalizado = TRUE`. Original pode ser descartado conforme política (CFM 1.638 — 20 anos para prontuário ativo).

---

## VIS — Visitantes

**RN-VIS-01** — Visitante é vinculado ao paciente que está visitando. Ao visitar, registra-se entrada (data/hora, leito).

**RN-VIS-02** — Limite de visitantes simultâneos por leito é configurável (default 2 por enfermaria, 4 por apartamento).

**RN-VIS-03** — Visitante bloqueado (paciente solicitou restrição ou histórico) **não** pode entrar mesmo que o paciente esteja internado.

**RN-VIS-04** — UTI tem regra especial: lista nominal por paciente, horários restritos, controle reforçado.

---

## LGP — LGPD e Auditoria

**RN-LGP-01** — Todo acesso a prontuário (visualização, exportação, impressão) é registrado em `acessos_prontuario` com finalidade explícita.

**RN-LGP-02** — Paciente pode solicitar via portal:
- consulta dos seus dados (Art. 18 LGPD),
- correção de dados pessoais (não clínicos — clínicos exigem retificação por profissional),
- portabilidade (export FHIR),
- revogação de consentimento.

**RN-LGP-03** — Solicitação de **exclusão** de dados pessoais é processada com **exceção** dos prontuários clínicos retidos por norma médica (CFM 1.638 — 20 anos).

**RN-LGP-04** — Toda exportação de dados de pacientes (em massa) exige aprovação de duas pessoas (Encarregado + supervisor).

**RN-LGP-05** — Vazamento de dados ou suspeita: sistema preserva eventos via `auditoria_eventos` para perícia e suporte ao Encarregado/DPO.

**RN-LGP-06** — Retenção de logs: 2 anos online, 5 anos arquivado. Após, descarte com registro.

**RN-LGP-07** — Criptografia: PHI sensível em repouso (CPF, CNS) usa chave gerenciada por KMS. Em trânsito, TLS 1.3.

---

## SEG — Segurança e Auth

**RN-SEG-01** — Senha mínima: 12 caracteres, complexidade NIST 800-63B (passphrase aceita). Hash Argon2id.

**RN-SEG-02** — MFA obrigatório para perfis: ADMIN, MEDICO (assinatura), FARMACEUTICO (controlados), AUDITOR.

**RN-SEG-03** — Bloqueio temporário (15 min) após 5 tentativas falhas. Bloqueio definitivo após 20 tentativas no mesmo IP em 1h.

**RN-SEG-04** — JWT access token: 15 min de validade. Refresh token: 7 dias, rotativo (cada uso emite novo, revoga anterior).

**RN-SEG-05** — Logout em todos os dispositivos: revoga todos os refresh tokens da `usuarios`.

**RN-SEG-06** — Tentativa de acesso a tenant diferente do JWT = log de segurança + bloqueio da sessão.

**RN-SEG-07** — Mudança de papel/perfil de usuário registra evento de auditoria com usuário origem (admin) e usuário-alvo.

**RN-SEG-08** — Assinatura digital ICP-Brasil exige certificado válido (não expirado, não revogado). Verificação online em emissão crítica (laudo, prescrição controlado).

---

## Resumo: tabela cruzada (regras × módulos)

| Módulo | Faixa de RNs |
|---|---|
| Recepção/Triagem | ATE-01 a ATE-08 |
| PEP | PEP-01 a PEP-10 |
| Prescrição | PRE-01 a PRE-08 |
| Farmácia | FAR-01 a FAR-08 |
| Centro Cirúrgico | CC-01 a CC-08 |
| Agendamento | AGE-01 a AGE-06 |
| Faturamento | FAT-01 a FAT-10 |
| Glosas | GLO-01 a GLO-07 |
| Repasse | REP-01 a REP-08 |
| CME | CME-01 a CME-05 |
| CCIH | CCI-01 a CCI-04 |
| SAME | SAM-01 a SAM-03 |
| Visitantes | VIS-01 a VIS-04 |
| LGPD | LGP-01 a LGP-07 |
| Segurança | SEG-01 a SEG-08 |

**Total: 96 regras numeradas.**
