/**
 * Domínio — equipe cirúrgica.
 *
 * Funções padrão (sem validar enum no DB — basta `VARCHAR(40)`):
 *   - CIRURGIAO       (obrigatório, pelo menos 1)
 *   - AUXILIAR_1
 *   - AUXILIAR_2
 *   - ANESTESISTA
 *   - INSTRUMENTADOR
 *   - CIRCULANTE
 *
 * RN-CC-08: cada membro da equipe gera 1 item HONORARIO em
 * `contas_itens` ao encerrar (Fase 9 fará a apuração de repasse).
 */

export const EQUIPE_FUNCOES = [
  'CIRURGIAO',
  'AUXILIAR_1',
  'AUXILIAR_2',
  'AUXILIAR_3',
  'ANESTESISTA',
  'INSTRUMENTADOR',
  'CIRCULANTE',
  'PERFUSIONISTA',
] as const;
export type EquipeFuncao = (typeof EQUIPE_FUNCOES)[number];

export interface EquipeMembroInput {
  prestadorUuid: string;
  funcao: string;
  ordem?: number;
}

/**
 * Garante que a equipe contém pelo menos um CIRURGIAO. Não exige funções
 * normalizadas — apenas verifica `funcao === 'CIRURGIAO'`. O cirurgião
 * principal é informado em campo separado (`cirurgiaoUuid`); ainda assim,
 * exigimos que ele apareça na lista de equipe (com função CIRURGIAO).
 */
export function temCirurgiao(equipe: EquipeMembroInput[]): boolean {
  return equipe.some((m) => m.funcao.toUpperCase() === 'CIRURGIAO');
}
