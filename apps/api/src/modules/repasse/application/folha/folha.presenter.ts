/**
 * Presenter — folha de produção do prestador.
 */
import type {
  FolhaAgregadoCriterioRow,
  FolhaAgregadoFuncaoRow,
  FolhaResumoRow,
} from '../../infrastructure/repasse.repository';
import type {
  FolhaAgregadoCriterio,
  FolhaAgregadoFuncao,
  FolhaPrestadorResumo,
} from '../../dto/responses-lifecycle';

export function presentFolhaResumo(
  row: FolhaResumoRow,
): FolhaPrestadorResumo {
  return {
    prestadorUuid: row.prestador_uuid,
    nome: row.prestador_nome,
    conselhoSigla: row.conselho_sigla,
    conselhoNumero: row.conselho_numero,
    repasseUuid: row.repasse_uuid,
    status: row.status,
    valorBruto: row.valor_bruto,
    valorLiquido: row.valor_liquido,
    qtdItens: Number(row.qtd_itens),
  };
}

export function presentAgregadoFuncao(
  row: FolhaAgregadoFuncaoRow,
): FolhaAgregadoFuncao {
  return {
    funcao: row.funcao ?? 'INDEFINIDO',
    qtd: Number(row.qtd),
    valor: row.valor,
  };
}

export function presentAgregadoCriterio(
  row: FolhaAgregadoCriterioRow,
): FolhaAgregadoCriterio {
  return {
    criterioUuid: row.criterio_uuid,
    descricao: row.descricao,
    qtd: Number(row.qtd),
    valor: row.valor,
  };
}
