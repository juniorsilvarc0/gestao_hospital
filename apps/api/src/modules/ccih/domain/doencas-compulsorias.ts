/**
 * Domínio — lista de doenças/agravos de notificação compulsória.
 *
 * Base: Portaria de Consolidação MS nº 4 / Portaria MS 264/2020 (lista
 * resumida — focada nas IRAS e doenças infecciosas mais comuns no
 * contexto hospitalar).
 *
 * Estrutura:
 *   - código CID-10 (categoria de 3 caracteres ou específico)
 *   - nome legível
 *   - imediato (notifica em até 24h) | semanal
 *
 * Uso: o use case `notificar-caso` apenas marca
 * `notificacao_compulsoria=TRUE` e `data_notificacao=now()`. O envio
 * efetivo ao SINAN/GAL fica fora do escopo (Fase 13 — integrações).
 *
 * Esta lista permite ao frontend exibir um warning quando o operador
 * digitar um CID compulsório, e ao backend documentar a regra.
 */

export interface DoencaCompulsoria {
  cid: string;
  nome: string;
  imediato: boolean;
}

/**
 * Lista hardcoded — não pretende ser exaustiva, apenas representativa
 * dos agravos mais frequentes no ambiente hospitalar. Alinhada à RN-CCI-03.
 */
export const DOENCAS_COMPULSORIAS: ReadonlyArray<DoencaCompulsoria> = [
  // Imediatas (24h) — surtos, infecções graves
  { cid: 'A05', nome: 'Outras intoxicações alimentares bacterianas', imediato: true },
  { cid: 'A09', nome: 'Diarreia e gastroenterite presumível infecciosa', imediato: false },
  { cid: 'A15', nome: 'Tuberculose respiratória confirmada', imediato: false },
  { cid: 'A16', nome: 'Tuberculose respiratória sem confirmação', imediato: false },
  { cid: 'A17', nome: 'Tuberculose do sistema nervoso', imediato: true },
  { cid: 'A36', nome: 'Difteria', imediato: true },
  { cid: 'A37', nome: 'Coqueluche', imediato: true },
  { cid: 'A39', nome: 'Doença meningocócica', imediato: true },
  { cid: 'A40', nome: 'Sepse estreptocócica', imediato: false },
  { cid: 'A41', nome: 'Outras septicemias', imediato: false },
  { cid: 'A50', nome: 'Sífilis congênita', imediato: true },
  { cid: 'A51', nome: 'Sífilis precoce', imediato: false },
  { cid: 'A53', nome: 'Sífilis não especificada', imediato: false },
  { cid: 'A82', nome: 'Raiva', imediato: true },
  { cid: 'A90', nome: 'Dengue', imediato: false },
  { cid: 'A91', nome: 'Febre hemorrágica devida ao vírus da dengue', imediato: true },
  { cid: 'A92', nome: 'Outras febres virais transmitidas por mosquitos', imediato: true },
  { cid: 'A95', nome: 'Febre amarela', imediato: true },
  { cid: 'B05', nome: 'Sarampo', imediato: true },
  { cid: 'B06', nome: 'Rubéola', imediato: true },
  { cid: 'B16', nome: 'Hepatite aguda B', imediato: false },
  { cid: 'B17', nome: 'Outras hepatites virais agudas', imediato: false },
  { cid: 'B19', nome: 'Hepatite viral não especificada', imediato: false },
  { cid: 'B20', nome: 'Doença pelo HIV', imediato: false },
  { cid: 'B24', nome: 'AIDS não especificada', imediato: false },
  { cid: 'B50', nome: 'Malária por Plasmodium falciparum', imediato: true },
  { cid: 'B54', nome: 'Malária não especificada', imediato: true },
  { cid: 'B55', nome: 'Leishmaniose', imediato: false },
  { cid: 'G00', nome: 'Meningite bacteriana', imediato: true },
  { cid: 'G03', nome: 'Meningite por outras causas', imediato: true },
  { cid: 'J09', nome: 'Influenza por vírus identificado', imediato: true },
  { cid: 'J10', nome: 'Influenza por outro vírus identificado', imediato: false },
  { cid: 'U07', nome: 'COVID-19 (suspeito ou confirmado)', imediato: true },
  // IRAS de notificação interna (CCIH) — nem todas são compulsórias ao
  // SINAN, mas devem ser notificadas internamente.
  { cid: 'T80', nome: 'Complicações de infecção pós-procedimento', imediato: false },
  { cid: 'T81', nome: 'Complicações de procedimentos NCOP', imediato: false },
  { cid: 'T82', nome: 'Complicações de prótese cardiovascular', imediato: false },
  { cid: 'T84', nome: 'Complicações de prótese ortopédica', imediato: false },
  { cid: 'T85', nome: 'Complicações de outros dispositivos protéticos', imediato: false },
];

const COMPULSORIAS_BY_CID = new Map<string, DoencaCompulsoria>(
  DOENCAS_COMPULSORIAS.map((d) => [d.cid, d]),
);

/**
 * Localiza o agravo compulsório por CID (categoria de 3 chars ou
 * específico). Tenta primeiro o CID exato; cai para a categoria de 3
 * caracteres.
 */
export function findCompulsoriaByCid(
  cid: string | null | undefined,
): DoencaCompulsoria | null {
  if (cid === null || cid === undefined) return null;
  const trimmed = cid.trim().toUpperCase();
  if (trimmed === '') return null;
  const exact = COMPULSORIAS_BY_CID.get(trimmed);
  if (exact !== undefined) return exact;
  // Cai para a categoria de 3 caracteres.
  if (trimmed.length > 3) {
    const cat = trimmed.substring(0, 3);
    const fromCat = COMPULSORIAS_BY_CID.get(cat);
    if (fromCat !== undefined) return fromCat;
  }
  return null;
}

/** `true` se o CID é de notificação compulsória. */
export function isCompulsoria(cid: string | null | undefined): boolean {
  return findCompulsoriaByCid(cid) !== null;
}
