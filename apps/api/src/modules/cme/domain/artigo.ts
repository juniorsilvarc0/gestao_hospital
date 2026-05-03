/**
 * Domínio — Artigo CME.
 *
 * Tipos puros + helpers de validação para o ciclo de vida de um artigo
 * (instrumental). A etapa atual é replicada em `cme_artigos.etapa_atual`
 * via trigger `tg_cme_movimentacao_atualiza_artigo` quando inserimos
 * uma `cme_movimentacoes`. Aqui apenas validamos antes de inserir.
 */
import { isTransicaoValida, type CmeEtapa } from './etapa-transicoes';

export interface MovimentarArtigoArgs {
  etapaAtual: CmeEtapa;
  etapaDestino: CmeEtapa;
  /** Status do lote do artigo — bloqueia ESTERILIZACAO→GUARDA se != LIBERADO. */
  loteStatus:
    | 'EM_PROCESSAMENTO'
    | 'AGUARDANDO_INDICADOR'
    | 'LIBERADO'
    | 'REPROVADO'
    | 'EXPIRADO';
  pacienteUuid?: string | null;
}

/**
 * Valida uma movimentação completa (transição + invariantes do lote +
 * argumentos requeridos). Retorna `null` se OK ou mensagem de erro.
 */
export function validateMovimentacao(args: MovimentarArtigoArgs): string | null {
  if (!isTransicaoValida(args.etapaAtual, args.etapaDestino)) {
    return `transição ${args.etapaAtual} → ${args.etapaDestino} não é válida`;
  }

  // RN-CME-02: ESTERILIZACAO → GUARDA exige lote LIBERADO.
  if (
    args.etapaAtual === 'ESTERILIZACAO' &&
    args.etapaDestino === 'GUARDA' &&
    args.loteStatus !== 'LIBERADO'
  ) {
    return `ESTERILIZACAO → GUARDA exige lote LIBERADO (status atual: ${args.loteStatus})`;
  }

  // Lote REPROVADO/EXPIRADO impede qualquer movimentação que não seja DESCARTADO.
  if (
    (args.loteStatus === 'REPROVADO' || args.loteStatus === 'EXPIRADO') &&
    args.etapaDestino !== 'DESCARTADO'
  ) {
    return `lote em status ${args.loteStatus}: artigo só pode ir para DESCARTADO`;
  }

  // RN-CME-05: EM_USO exige paciente.
  if (
    args.etapaDestino === 'EM_USO' &&
    (args.pacienteUuid === null || args.pacienteUuid === undefined)
  ) {
    return 'movimentação para EM_USO exige paciente (RN-CME-05)';
  }

  return null;
}
