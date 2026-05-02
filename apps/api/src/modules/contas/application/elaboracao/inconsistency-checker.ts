/**
 * `inconsistency-checker` — varre os itens de uma conta e devolve a
 * lista de inconsistências detectadas para gravar em
 * `contas.inconsistencias` (JSONB).
 *
 * Regras cobertas:
 *   - ITEM_SEM_PRESTADOR: PROCEDIMENTO/HONORARIO sem prestador_executante.
 *   - VALOR_ZERO: item com valor_unitario = 0 quando o grupo_gasto não
 *     é HONORARIO (warning — pode ser um item bonificado, mas merece
 *     revisão).
 *   - GRUPO_GASTO_MISMATCH: contas_itens.grupo_gasto difere do
 *     procedimento.grupo_gasto.
 *   - OPME_SEM_REGISTRO_ANVISA: item de OPME sem registro_anvisa.
 *   - OPME_SEM_LOTE: item de OPME sem lote.
 *   - ITEM_DUPLICADO: mesmo procedimento + mesma data_realizacao +
 *     mesmo prestador.
 *   - PACOTE_INCOMPLETO: pacote com itens previstos faltantes.
 *   - NAO_AUTORIZADO: emitido apenas se o convênio exigir autorização
 *     (sinalização externa). Aqui marcamos o item sem autorização e
 *     deixamos o use case decidir se vira `erro` ou `info` conforme
 *     condicao_contratual.exige_autorizacao_*.
 *
 * Implementação 100% pura — recebe dados pré-carregados, devolve
 * lista. Permite testes determinísticos.
 */
import {
  pacoteFaltantes,
  type PacoteItemRef,
} from '../../domain/pacote';
import type { Inconsistencia } from '../../domain/inconsistencia';

export type GrupoGasto =
  | 'PROCEDIMENTO'
  | 'DIARIA'
  | 'TAXA'
  | 'SERVICO'
  | 'MATERIAL'
  | 'MEDICAMENTO'
  | 'OPME'
  | 'GAS'
  | 'PACOTE'
  | 'HONORARIO';

export interface ItemForCheck {
  /** ID textual do item (uuid_externo ou pk como string) usado em mensagens. */
  itemId: string;
  procedimentoId: string;
  procedimentoNome: string | null;
  procedimentoGrupoGasto: GrupoGasto;
  grupoGasto: GrupoGasto;
  quantidade: number;
  valorUnitario: number;
  prestadorExecutanteId: string | null;
  dataRealizacaoIso: string | null;
  autorizado: boolean;
  numeroAutorizacao: string | null;
  foraPacote: boolean;
  pacoteId: string | null;
  lote: string | null;
  registroAnvisa: string | null;
}

export interface PacoteForCheck {
  pacoteId: string;
  itensPrevistos: PacoteItemRef[];
}

export interface InconsistencyCheckArgs {
  itens: ItemForCheck[];
  pacotesNaConta: PacoteForCheck[];
  /** Convênio exige autorização para procedimentos/internação? */
  exigirAutorizacao: boolean;
}

const GRUPOS_QUE_EXIGEM_PRESTADOR: GrupoGasto[] = [
  'PROCEDIMENTO',
  'HONORARIO',
];

export function checkInconsistencias(
  args: InconsistencyCheckArgs,
): Inconsistencia[] {
  const out: Inconsistencia[] = [];

  // Map para item duplicado: chave = procedimentoId|data|prestador
  const dupMap = new Map<string, ItemForCheck[]>();

  for (const it of args.itens) {
    // 1) Sem prestador
    if (
      GRUPOS_QUE_EXIGEM_PRESTADOR.includes(it.grupoGasto) &&
      it.prestadorExecutanteId === null
    ) {
      out.push({
        severidade: 'erro',
        codigo: 'ITEM_SEM_PRESTADOR',
        item_id: it.itemId,
        mensagem: `Item ${it.procedimentoNome ?? it.procedimentoId} (${it.grupoGasto}) está sem prestador executante.`,
      });
    }

    // 2) Valor zero (warning) — não vale para HONORARIO (pode ser
    //    bonificado/pacote).
    if (it.valorUnitario === 0 && it.grupoGasto !== 'HONORARIO') {
      out.push({
        severidade: 'warning',
        codigo: 'VALOR_ZERO',
        item_id: it.itemId,
        mensagem: `Item ${it.procedimentoNome ?? it.procedimentoId} com valor unitário zero (revisar).`,
      });
    }

    // 3) Grupo gasto mismatch (procedimento × item)
    if (it.procedimentoGrupoGasto !== it.grupoGasto) {
      out.push({
        severidade: 'warning',
        codigo: 'GRUPO_GASTO_MISMATCH',
        item_id: it.itemId,
        mensagem: `Grupo de gasto do item (${it.grupoGasto}) difere do cadastro do procedimento (${it.procedimentoGrupoGasto}).`,
      });
    }

    // 4) OPME — registro ANVISA
    if (it.grupoGasto === 'OPME' && (it.registroAnvisa === null || it.registroAnvisa.trim() === '')) {
      out.push({
        severidade: 'erro',
        codigo: 'OPME_SEM_REGISTRO_ANVISA',
        item_id: it.itemId,
        mensagem: `Item OPME ${it.procedimentoNome ?? it.procedimentoId} sem registro ANVISA.`,
      });
    }

    // 5) OPME — lote
    if (it.grupoGasto === 'OPME' && (it.lote === null || it.lote.trim() === '')) {
      out.push({
        severidade: 'erro',
        codigo: 'OPME_SEM_LOTE',
        item_id: it.itemId,
        mensagem: `Item OPME ${it.procedimentoNome ?? it.procedimentoId} sem lote informado.`,
      });
    }

    // 6) Não autorizado (apenas se convênio exigir)
    if (args.exigirAutorizacao && !it.autorizado && it.grupoGasto !== 'HONORARIO') {
      out.push({
        severidade: 'erro',
        codigo: 'NAO_AUTORIZADO',
        item_id: it.itemId,
        mensagem: `Item ${it.procedimentoNome ?? it.procedimentoId} sem autorização — convênio exige.`,
      });
    }

    // 7) Duplicidade: mesmo proc + data + prestador
    const dupKey = [
      it.procedimentoId,
      it.dataRealizacaoIso ?? 'null',
      it.prestadorExecutanteId ?? 'null',
    ].join('|');
    const list = dupMap.get(dupKey) ?? [];
    list.push(it);
    dupMap.set(dupKey, list);
  }

  for (const [key, group] of dupMap.entries()) {
    if (group.length > 1) {
      // Reporta cada item após o primeiro como duplicado.
      for (let i = 1; i < group.length; i += 1) {
        const it = group[i];
        out.push({
          severidade: 'warning',
          codigo: 'ITEM_DUPLICADO',
          item_id: it.itemId,
          mensagem: `Item duplicado (mesmo procedimento, data e prestador): chave ${key}.`,
        });
      }
    }
  }

  // 8) Pacote incompleto — para cada pacote presente na conta, conferir
  //    se todos os itens previstos estão lançados (RN-FAT-05).
  for (const pac of args.pacotesNaConta) {
    const lancados: PacoteItemRef[] = args.itens
      .filter(
        (it) =>
          it.pacoteId === pac.pacoteId &&
          (it.grupoGasto !== 'PACOTE' /* item de detalhe, não cabeça */),
      )
      .map((it) => ({
        procedimentoId: BigInt(it.procedimentoId),
        quantidade: it.quantidade,
      }));
    const faltantes = pacoteFaltantes({
      itensPrevistos: pac.itensPrevistos,
      itensLancados: lancados,
    });
    if (faltantes.length > 0) {
      out.push({
        severidade: 'warning',
        codigo: 'PACOTE_INCOMPLETO',
        mensagem: `Pacote ${pac.pacoteId} possui ${faltantes.length} item(ns) previstos faltando.`,
      });
    }
  }

  return out;
}
