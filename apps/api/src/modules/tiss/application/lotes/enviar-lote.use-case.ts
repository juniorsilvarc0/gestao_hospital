/**
 * `POST /v1/tiss/lotes/{uuid}/enviar` — marca lote como ENVIADO.
 *
 * Este use case:
 *   1. Confere que o lote está em `VALIDADO` (qualquer outro estado é
 *      422 — RN-FAT-04).
 *   2. (TODO Fase 13) Faz o envio HTTP/SOAP ao webservice da operadora
 *      e captura o retorno. Por ora, apenas atualiza o status local.
 *   3. Atualiza `data_envio` e propaga `ENVIADA` para as guias do
 *      lote (apenas as que estão `VALIDADA`).
 *
 * RN-FAT-04: após `ENVIADO`, a trigger DB bloqueia alteração — para
 * reenviar, usa `reenviar-lote.use-case.ts`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { LoteResponse } from '../../dto/responses';
import { TissRepository } from '../../infrastructure/tiss.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class EnviarLoteUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<LoteResponse> {
    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    if (lote.status !== 'VALIDADO') {
      throw new UnprocessableEntityException({
        code: 'LOTE_NAO_VALIDADO',
        message: `Lote em ${lote.status} não pode ser enviado. Exige status VALIDADO.`,
      });
    }

    // TODO Fase 13: chamar webservice da operadora aqui (SOAP/HTTP).
    // Este use case hoje apenas registra o envio local — a integração
    // externa fica para o microsserviço Go de TISS (STACK.md §6).

    await this.repo.updateLoteEnvio({
      id: lote.id,
      xmlUrl: null,
    });

    // Promove guias VALIDADA → ENVIADA.
    const guias = await this.repo.findGuiasByLote(lote.id);
    for (const g of guias) {
      if (g.status === 'VALIDADA') {
        await this.repo.updateGuiaStatus({
          id: g.id,
          status: 'ENVIADA',
          dataEnvio: new Date(),
        });
      }
    }

    await this.auditoria.record({
      tabela: 'lotes_tiss',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'lote_tiss.enviado',
        numero_lote: lote.numero_lote,
        qtd_guias: lote.qtd_guias,
        valor_total: lote.valor_total,
        // Sinaliza que ainda é envio "stub" — futuro microsserviço
        // adicionará protocolo da operadora.
        envio_modo: 'STUB_LOCAL',
      },
      finalidade: 'tiss.lote.enviado',
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote enviado não encontrado.');
    }
    return presentLote(updated);
  }
}
