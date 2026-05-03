/**
 * Processor para webhook `LAB_APOIO`.
 *
 * Para cada item do payload:
 *   1. Localiza o `solicitacoes_exame_itens` correspondente:
 *      - Preferência: `itemUuid` (se vier);
 *      - Fallback: solicitação por `numero_guia` + item por
 *        `codigo_procedimento`.
 *   2. Cria `resultados_exame` com `status = LAUDO_FINAL` e flag
 *      `assinado_em = NULL` (laboratório externo NÃO assina ICP-Brasil
 *      via webhook — assinatura interna acontece quando um laudista
 *      revisa, fora do escopo desta trilha).
 *
 * Itens órfãos viram alerta (não derruba o lote inteiro).
 */
import { Injectable, Logger } from '@nestjs/common';

import type { WebhookLabApoioDto, LabApoioItemDto } from '../dto/lab-apoio.dto';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';

interface ProcessLabResult {
  resultadosCriados: number;
  itensComAlerta: { codigoProcedimento: string; motivo: string }[];
}

@Injectable()
export class ProcessLabApoioUseCase {
  private readonly logger = new Logger(ProcessLabApoioUseCase.name);

  constructor(private readonly repo: WebhooksRepository) {}

  async execute(
    tenantId: bigint,
    payload: unknown,
  ): Promise<ProcessLabResult> {
    const dto = payload as WebhookLabApoioDto;
    const result: ProcessLabResult = {
      resultadosCriados: 0,
      itensComAlerta: [],
    };

    // Resolve solicitação base (necessária para fallback por código).
    const solic = await this.repo.findSolicitacaoExameByCodigo(
      dto.solicitacaoCodigo,
    );

    for (const item of dto.examesResultados) {
      try {
        const resolved = await this.resolveItem(item, solic);
        if (resolved === null) {
          result.itensComAlerta.push({
            codigoProcedimento: item.codigoProcedimento,
            motivo:
              'Item da solicitação não localizado (itemUuid ou (solicitacao + codigo)).',
          });
          continue;
        }
        await this.repo.insertResultadoExterno({
          tenantId,
          solicitacaoItemId: resolved.itemId,
          pacienteId: resolved.pacienteId,
          laudoTexto: item.resultadoTexto,
          laudoEstruturado: item.valoresQuantitativos ?? null,
          laudoPdfUrl: item.laudoUrl ?? null,
        });
        result.resultadosCriados += 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        this.logger.warn(
          { err: msg, codigo: item.codigoProcedimento },
          'lab.apoio.item.failed',
        );
        result.itensComAlerta.push({
          codigoProcedimento: item.codigoProcedimento,
          motivo: msg,
        });
      }
    }

    return result;
  }

  private async resolveItem(
    item: LabApoioItemDto,
    solic: { id: bigint; paciente_id: bigint } | null,
  ): Promise<{ itemId: bigint; pacienteId: bigint } | null> {
    if (item.itemUuid !== undefined) {
      const found = await this.repo.findItemByUuid(item.itemUuid);
      if (found === null) return null;
      return { itemId: found.id, pacienteId: found.paciente_id };
    }
    if (solic === null) return null;
    const found = await this.repo.findItemBySolicitacaoAndProcedimento(
      solic.id,
      item.codigoProcedimento,
    );
    if (found === null) return null;
    return { itemId: found.id, pacienteId: solic.paciente_id };
  }
}
