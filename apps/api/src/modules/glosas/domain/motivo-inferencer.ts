/**
 * RN-GLO-06 — Sugestão automática de motivo de glosa.
 *
 * Baseado em uma tabela básica hardcoded de códigos TISS comuns. A real
 * tabela completa fica a cargo do módulo TISS quando ele for implementado;
 * aqui mantemos um mapa mínimo cobrindo as famílias mais frequentes:
 *
 *   1xxx — divergência de cadastro/elegibilidade
 *   2xxx — divergência clínica/codificação
 *   3xxx — autorização (ausência ou divergência)
 *   4xxx — divergência de tabela/preço
 *   5xxx — limite/regra contratual
 *   9xxx — administrativa / prazo / outras
 *
 * Esses prefixos são heurísticos — quando o código exato não está mapeado,
 * usamos o prefixo (1º dígito) para sugerir uma família.
 */

export type MotivoSugerido =
  | 'CADASTRO'
  | 'CODIGO'
  | 'AUTORIZACAO'
  | 'PRECO'
  | 'LIMITE_CONTRATUAL'
  | 'ADMINISTRATIVA'
  | 'INDETERMINADO';

interface MotivoInfo {
  motivo: MotivoSugerido;
  descricao: string;
}

/**
 * Mapa direto de códigos TISS conhecidos → motivo sugerido.
 *
 * Fonte: Manual de Padronização TISS (versão 4.x) — tabela 38 (motivos
 * de glosa). Subset cobrindo os mais comuns na operação hospitalar.
 */
const CODIGO_PARA_MOTIVO: Readonly<Record<string, MotivoInfo>> = {
  // 1xxx — cadastro/beneficiário
  '1001': { motivo: 'CADASTRO', descricao: 'Beneficiário sem cadastro' },
  '1003': { motivo: 'CADASTRO', descricao: 'Carteira inválida ou vencida' },
  '1005': { motivo: 'CADASTRO', descricao: 'Beneficiário em carência' },
  // 2xxx — codificação clínica / divergência de procedimento
  '2001': { motivo: 'CODIGO', descricao: 'Código de procedimento inválido' },
  '2003': { motivo: 'CODIGO', descricao: 'Procedimento não cobre indicação clínica' },
  '2010': { motivo: 'CODIGO', descricao: 'Quantidade de procedimento divergente' },
  // 3xxx — autorização
  '3001': { motivo: 'AUTORIZACAO', descricao: 'Procedimento sem autorização prévia' },
  '3002': { motivo: 'AUTORIZACAO', descricao: 'Senha de autorização inválida' },
  '3010': { motivo: 'AUTORIZACAO', descricao: 'Autorização vencida' },
  // 4xxx — preço / tabela
  '4001': { motivo: 'PRECO', descricao: 'Valor unitário acima da tabela contratada' },
  '4002': { motivo: 'PRECO', descricao: 'Tabela de preços divergente' },
  '4010': { motivo: 'PRECO', descricao: 'Cálculo de honorário incorreto' },
  // 5xxx — limite / regra contratual
  '5001': { motivo: 'LIMITE_CONTRATUAL', descricao: 'Limite anual excedido' },
  '5002': { motivo: 'LIMITE_CONTRATUAL', descricao: 'Procedimento fora do rol contratado' },
  // 9xxx — administrativa / prazo
  '9001': { motivo: 'ADMINISTRATIVA', descricao: 'Apresentação fora do prazo' },
  '9002': { motivo: 'ADMINISTRATIVA', descricao: 'Documentação incompleta' },
};

const PREFIXO_FALLBACK: Readonly<Record<string, MotivoInfo>> = {
  '1': { motivo: 'CADASTRO', descricao: 'Família 1xxx — cadastro/elegibilidade' },
  '2': { motivo: 'CODIGO', descricao: 'Família 2xxx — divergência de código/quantidade' },
  '3': { motivo: 'AUTORIZACAO', descricao: 'Família 3xxx — autorização prévia' },
  '4': { motivo: 'PRECO', descricao: 'Família 4xxx — divergência de preço/tabela' },
  '5': { motivo: 'LIMITE_CONTRATUAL', descricao: 'Família 5xxx — limite contratual' },
  '9': { motivo: 'ADMINISTRATIVA', descricao: 'Família 9xxx — administrativa' },
};

/**
 * Sugestão para um código TISS de glosa. Retorna sempre um `MotivoInfo`
 * — quando o código não puder ser classificado, devolve `INDETERMINADO`.
 */
export function inferMotivoGlosa(
  codigoGlosaTiss: string | null | undefined,
): MotivoInfo {
  if (codigoGlosaTiss === null || codigoGlosaTiss === undefined) {
    return { motivo: 'INDETERMINADO', descricao: 'Código não informado' };
  }
  const codigo = codigoGlosaTiss.trim();
  if (codigo.length === 0) {
    return { motivo: 'INDETERMINADO', descricao: 'Código vazio' };
  }
  const exato = CODIGO_PARA_MOTIVO[codigo];
  if (exato !== undefined) return exato;
  const prefixo = PREFIXO_FALLBACK[codigo[0]];
  if (prefixo !== undefined) return prefixo;
  return {
    motivo: 'INDETERMINADO',
    descricao: `Código ${codigo} não mapeado`,
  };
}

/**
 * `true` se o motivo informado pelo operador é "genérico" (vazio ou muito
 * curto) e portanto deve ser enriquecido com a sugestão automática.
 */
export function isMotivoGenerico(motivo: string | null | undefined): boolean {
  if (motivo === null || motivo === undefined) return true;
  const m = motivo.trim().toLowerCase();
  if (m.length < 5) return true;
  // Lista heurística de termos genéricos que justificam enriquecer.
  return ['glosa', 'glosa tiss', 'glosa eletronica', 'sem motivo', 'n/a'].includes(m);
}
