/**
 * Domínio — matriz de transições válidas entre etapas de um artigo CME.
 *
 * Etapas do enum `enum_cme_etapa`:
 *   RECEPCAO → LIMPEZA → PREPARO → ESTERILIZACAO → GUARDA →
 *   DISTRIBUICAO → EM_USO → (volta) RECEPCAO
 *
 * Qualquer etapa pode transitar para `DESCARTADO` (saída do ciclo).
 *
 * Regras importantes:
 *   - RN-CME-02: só sai de `DISTRIBUICAO` para `EM_USO` se vier de
 *     `GUARDA` (= lote LIBERADO já passado por estoque).
 *   - `ESTERILIZACAO → GUARDA` exige lote.status = LIBERADO (validação
 *     extra no use case — domínio só conhece a transição em si).
 *   - `EM_USO → RECEPCAO` permite reprocessar (caso de instrumental
 *     reaproveitável após cirurgia).
 */

export const CME_ETAPAS = [
  'RECEPCAO',
  'LIMPEZA',
  'PREPARO',
  'ESTERILIZACAO',
  'GUARDA',
  'DISTRIBUICAO',
  'EM_USO',
  'DESCARTADO',
] as const;
export type CmeEtapa = (typeof CME_ETAPAS)[number];

/** Map etapa atual → conjunto de etapas válidas como destino. */
const TRANSICOES: Readonly<Record<CmeEtapa, ReadonlySet<CmeEtapa>>> = {
  RECEPCAO: new Set(['LIMPEZA', 'DESCARTADO']),
  LIMPEZA: new Set(['PREPARO', 'DESCARTADO']),
  PREPARO: new Set(['ESTERILIZACAO', 'DESCARTADO']),
  ESTERILIZACAO: new Set(['GUARDA', 'DESCARTADO']),
  GUARDA: new Set(['DISTRIBUICAO', 'DESCARTADO']),
  DISTRIBUICAO: new Set(['EM_USO', 'DESCARTADO']),
  EM_USO: new Set(['RECEPCAO', 'DESCARTADO']),
  DESCARTADO: new Set(),
};

/** `true` se `destino` é alcançável a partir de `origem`. */
export function isTransicaoValida(origem: CmeEtapa, destino: CmeEtapa): boolean {
  return TRANSICOES[origem].has(destino);
}

/**
 * Lista de destinos válidos a partir de uma etapa — útil para o
 * frontend exibir só os botões cabíveis.
 */
export function destinosValidos(origem: CmeEtapa): CmeEtapa[] {
  return Array.from(TRANSICOES[origem]);
}

/**
 * RN-CME-02 — `EM_USO` exige paciente. `cirurgia` é opcional (pode ser
 * uso clínico fora do bloco). Retorna `null` se OK ou mensagem de erro.
 */
export function validateEmUsoArgs(args: {
  destino: CmeEtapa;
  pacienteUuid?: string | null;
}): string | null {
  if (args.destino !== 'EM_USO') return null;
  if (args.pacienteUuid === null || args.pacienteUuid === undefined) {
    return 'movimentação para EM_USO exige paciente (RN-CME-05)';
  }
  return null;
}
