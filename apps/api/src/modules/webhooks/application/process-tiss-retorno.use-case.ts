/**
 * Processor para webhook `TISS_RETORNO`.
 *
 * Estratégia:
 *   1. Se vier `protocoloOperadora`, atualiza
 *      `lotes_tiss.protocolo_operadora` (idempotente — UPDATE em
 *      campo único).
 *   2. Se vier `glosas[]`, delega para `ImportarGlosasTissUseCase` da
 *      Trilha R-C de glosas. O use case já é idempotente (cada glosa
 *      faz INSERT — duplicatas verdadeiras precisam de unique key
 *      adequado em glosas, fora do escopo desta trilha).
 *   3. Se vier `contasPagas[]`, marca cada conta como PAGA via
 *      `MarcarPagaUseCase` interno (com checagem de status atual).
 *
 * Retorno: contagens para a admin acompanhar.
 */
import { Injectable } from '@nestjs/common';

import { ImportarGlosasTissUseCase } from '../../glosas/application/importar-glosas-tiss.use-case';
import type { ImportarGlosasTissDto } from '../../glosas/dto/importar-glosas-tiss.dto';
import type { WebhookTissRetornoDto } from '../dto/tiss-retorno.dto';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';

interface ProcessTissResult {
  loteAtualizado: boolean;
  glosasImportadas: number;
  glosasComAlerta: number;
  contasPagas: number;
  contasComAlerta: { contaNumero: string; motivo: string }[];
}

@Injectable()
export class ProcessTissRetornoUseCase {
  constructor(
    private readonly repo: WebhooksRepository,
    private readonly importarGlosas: ImportarGlosasTissUseCase,
  ) {}

  async execute(
    _tenantId: bigint,
    payload: unknown,
  ): Promise<ProcessTissResult> {
    const dto = payload as WebhookTissRetornoDto;
    const result: ProcessTissResult = {
      loteAtualizado: false,
      glosasImportadas: 0,
      glosasComAlerta: 0,
      contasPagas: 0,
      contasComAlerta: [],
    };

    // 1. Lote / protocolo.
    if (dto.protocoloOperadora !== undefined) {
      const lote = await this.repo.findLoteTissByNumero(dto.loteNumero);
      if (lote === null) {
        result.contasComAlerta.push({
          contaNumero: dto.loteNumero,
          motivo: 'Lote TISS não encontrado por numero_lote.',
        });
      } else {
        await this.repo.updateLoteProtocolo(lote.id, dto.protocoloOperadora);
        result.loteAtualizado = true;
      }
    }

    // 2. Glosas — delega para ImportarGlosasTissUseCase.
    if (dto.glosas !== undefined && dto.glosas.length > 0) {
      const importarDto: ImportarGlosasTissDto = {
        glosas: dto.glosas.map((g) => ({
          ...(g.guiaNumero !== undefined
            ? { guiaNumeroPrestador: g.guiaNumero }
            : {}),
          ...(g.contaItemReferencia !== undefined
            ? { contaItemReferencia: g.contaItemReferencia }
            : {}),
          motivo: g.motivo,
          codigoGlosaTiss: g.codigoGlosaTiss,
          valorGlosado: g.valorGlosado,
          dataGlosa: g.dataGlosa,
        })),
      };
      const out = await this.importarGlosas.execute(importarDto);
      result.glosasImportadas = out.importadas;
      result.glosasComAlerta = out.comAlerta.length;
    }

    // 3. Contas pagas (idempotente — não marca PAGA novamente).
    if (dto.contasPagas !== undefined && dto.contasPagas.length > 0) {
      for (const cp of dto.contasPagas) {
        const contaId = await this.repo.findContaIdByNumero(cp.contaNumero);
        if (contaId === null) {
          result.contasComAlerta.push({
            contaNumero: cp.contaNumero,
            motivo: 'Conta não encontrada por numero_conta.',
          });
          continue;
        }
        const atual = await this.repo.findContaStatusById(contaId);
        if (atual === null) {
          result.contasComAlerta.push({
            contaNumero: cp.contaNumero,
            motivo: 'Conta sumiu durante processamento (RLS?).',
          });
          continue;
        }
        if (atual.status === 'PAGA') {
          // Idempotente — já está paga. Conta como sucesso.
          result.contasPagas += 1;
          continue;
        }
        if (atual.status === 'CANCELADA') {
          result.contasComAlerta.push({
            contaNumero: cp.contaNumero,
            motivo: 'Conta CANCELADA — pagamento ignorado.',
          });
          continue;
        }
        await this.repo.marcarContaPaga({
          contaId,
          valorPago: cp.valorPago.toFixed(4),
        });
        result.contasPagas += 1;
      }
    }

    return result;
  }
}
