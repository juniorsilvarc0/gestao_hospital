/**
 * Listener — escuta `glosa.recurso_resolvido` (Fase 8 R-C) e dispara
 * a reapuração de repasse (RN-REP-06).
 *
 * Payload (definido em `FinalizarGlosaUseCase`):
 *   {
 *     glosaUuid: string,
 *     contaUuid: string,
 *     status: GlosaStatus terminal,
 *     valorRevertido: string (decimal-as-string)
 *   }
 *
 * Observação: `EventEmitter2` despacha SINCRONAMENTE no contexto da
 * request original, então o `RequestContextStorage` ainda contém
 * `tenantId`/`userId`/`tx` quando o listener executa (mesmo
 * tx Postgres → mesma transação RLS).
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  HandleGlosaResolvidaUseCase,
  type GlosaResolvidaEventPayload,
} from '../../application/reapuracao/handle-glosa-resolvida.use-case';

@Injectable()
export class GlosaResolvidaListener {
  private readonly logger = new Logger(GlosaResolvidaListener.name);

  constructor(private readonly handler: HandleGlosaResolvidaUseCase) {}

  @OnEvent('glosa.recurso_resolvido', { async: true })
  async onGlosaResolvida(
    payload: GlosaResolvidaEventPayload,
  ): Promise<void> {
    try {
      await this.handler.execute(payload);
    } catch (err: unknown) {
      // Não rethrow: ouvimos o evento de forma resiliente. Em produção
      // este caminho deveria escrever em outbox/DLQ para retry — aqui
      // logamos e seguimos.
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          glosaUuid: payload?.glosaUuid,
          contaUuid: payload?.contaUuid,
        },
        'Falha ao processar reapuração de glosa resolvida.',
      );
    }
  }
}
