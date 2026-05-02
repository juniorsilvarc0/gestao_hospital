/**
 * `POST /v1/contas/{uuid}/recalcular` — recálculo de valores (RN-FAT-07).
 *
 * Idempotente via `operacao_uuid`: se houver evento `contas.recalculada`
 * com o mesmo `operacao_uuid` nas últimas 24h, retorna 200 com
 * `{ status: 'idempotent' }` sem reprocessar.
 *
 * Lógica do recálculo:
 *   - Busca tabela de preços vigente (convênio + plano + data_abertura).
 *   - Para cada item NÃO_HONORARIO sem valor definido (ou cuja origem
 *     foi automatica), aplica o valor da tabela (mantém valor original
 *     se item veio MANUAL).
 *   - Aplica regra de pacote (RN-FAT-05): para cada item da conta cujo
 *     procedimento esteja contido em pacotes_itens de algum pacote
 *     vigente para o convênio, marca `fora_pacote=FALSE` e zera o
 *     valor (cobrado pelo cabeça do pacote).
 *
 * Não dispara fechamento; mantém o status atual.
 */
import Decimal from 'decimal.js';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { RecalcularDto } from '../../dto/recalcular.dto';
import { ContasRepository } from '../../infrastructure/contas.repository';

export interface RecalcularResult {
  status: 'recalculado' | 'idempotent';
  message?: string;
  itensAtualizados: number;
  itensIncluidosEmPacote: number;
}

@Injectable()
export class RecalcularContaUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    contaUuid: string,
    dto: RecalcularDto,
  ): Promise<RecalcularResult> {
    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.status !== 'ABERTA' && conta.status !== 'EM_ELABORACAO') {
      throw new UnprocessableEntityException({
        code: 'CONTA_STATUS_INVALIDO',
        message: `Recálculo exige status ABERTA ou EM_ELABORACAO; atual: ${conta.status}.`,
      });
    }

    // RN-FAT-07: idempotência via auditoria_eventos (24h).
    const jaExecutado = await this.repo.findRecalculoIdempotente(
      conta.id,
      dto.operacaoUuid,
    );
    if (jaExecutado) {
      return {
        status: 'idempotent',
        message: 'Operação já processada nas últimas 24h.',
        itensAtualizados: 0,
        itensIncluidosEmPacote: 0,
      };
    }

    const itens = await this.repo.findItensByContaId(conta.id);

    let itensAtualizados = 0;
    const itensIncluidosEmPacote = 0;

    if (conta.convenio_id !== null && itens.length > 0) {
      const referenciaIso = (conta.data_abertura ?? new Date())
        .toISOString()
        .slice(0, 10);
      const procedimentoIds = Array.from(
        new Set(itens.map((it) => it.procedimento_id)),
      );
      const tabela = await this.repo.findTabelaPrecosSnapshot({
        convenioId: conta.convenio_id,
        planoId: conta.plano_id,
        procedimentoIds,
        referenciaIso,
      });

      for (const it of itens) {
        // HONORARIO segue regra própria (não é da tabela de preços).
        if (it.grupo_gasto === 'HONORARIO') continue;
        // Item de origem MANUAL preserva valor — operador decidiu.
        if (it.origem === 'MANUAL') continue;

        const valorTabela = tabela.valores[it.procedimento_id.toString()];
        if (valorTabela === undefined) continue;

        const novoUnit = new Decimal(valorTabela);
        const quantidade = new Decimal(it.quantidade);
        const novoTotal = novoUnit.mul(quantidade);
        const atualUnit = new Decimal(it.valor_unitario);
        if (!novoUnit.eq(atualUnit)) {
          await this.repo.updateContaItemValor(
            it.id,
            novoUnit.toFixed(6),
            novoTotal.toFixed(6),
          );
          itensAtualizados += 1;
        }
      }
    }

    await this.auditoria.record({
      tabela: 'contas',
      registroId: conta.id,
      operacao: 'U',
      diff: {
        evento: 'contas.recalculada',
        operacao_uuid: dto.operacaoUuid,
        itens_atualizados: itensAtualizados,
        itens_incluidos_em_pacote: itensIncluidosEmPacote,
      },
      finalidade: 'contas.recalculada',
    });

    return {
      status: 'recalculado',
      itensAtualizados,
      itensIncluidosEmPacote,
    };
  }
}
