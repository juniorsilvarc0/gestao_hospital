/**
 * `POST /v1/webhooks/inbox/{uuid}/reprocessar` — admin força
 * reprocessamento.
 *
 * Comportamento:
 *   - Só aceita registros em estado `ERRO`. Para `RECEBIDO` /
 *     `PROCESSANDO`/`PROCESSADO`/`IGNORADO` retorna 409 (estado
 *     incoerente) — admin deve marcar manualmente como ERRO antes se
 *     necessário (não escopo).
 *   - Reusa o `payload` JSONB da linha original — sem nova chamada de
 *     parceiro, sem revalidar HMAC (admin já decidiu).
 *   - Marca PROCESSANDO + tentativa+1, processa, depois PROCESSADO ou
 *     ERRO.
 */
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { ReprocessarWebhookDto } from '../dto/reprocessar.dto';
import type { WebhookOrigem } from '../dto/list-webhooks.dto';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';
import { ProcessTissRetornoUseCase } from './process-tiss-retorno.use-case';
import { ProcessLabApoioUseCase } from './process-lab-apoio.use-case';
import { ProcessFinanceiroUseCase } from './process-financeiro.use-case';

@Injectable()
export class ReprocessarWebhookUseCase {
  private readonly logger = new Logger(ReprocessarWebhookUseCase.name);

  constructor(
    private readonly repo: WebhooksRepository,
    private readonly auditoria: AuditoriaService,
    private readonly tissUC: ProcessTissRetornoUseCase,
    private readonly labUC: ProcessLabApoioUseCase,
    private readonly finUC: ProcessFinanceiroUseCase,
  ) {}

  async execute(
    uuid: string,
    dto: ReprocessarWebhookDto,
  ): Promise<{ status: 'PROCESSADO' | 'ERRO'; resultado?: unknown }> {
    const row = await this.repo.findByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'WEBHOOK_NAO_ENCONTRADO',
        message: 'Webhook não encontrado.',
      });
    }
    if (row.status !== 'ERRO') {
      throw new ConflictException({
        code: 'WEBHOOK_REPROCESSAR_ESTADO_INVALIDO',
        message: `Webhook em estado ${row.status} — só ERRO admite reprocessamento.`,
      });
    }

    await this.repo.markStatus(row.id, 'PROCESSANDO', {
      incrementarTentativa: true,
    });
    await this.auditoria.record({
      tabela: 'webhooks_inbox',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'webhook.reprocessar.iniciado',
        origem: row.origem,
        motivo: dto.motivo ?? null,
      },
      finalidade: 'webhook.reprocessar.iniciado',
    });

    try {
      const result = await this.processByOrigem(
        row.origem as WebhookOrigem,
        row.tenant_id,
        row.payload,
      );
      await this.repo.markStatus(row.id, 'PROCESSADO', { resultado: result });
      await this.auditoria.record({
        tabela: 'webhooks_inbox',
        registroId: row.id,
        operacao: 'U',
        diff: {
          evento: 'webhook.reprocessar.sucesso',
          origem: row.origem,
        },
        finalidade: 'webhook.reprocessar.sucesso',
      });
      return { status: 'PROCESSADO', resultado: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido';
      const stack = err instanceof Error ? err.stack ?? null : null;
      await this.repo.markStatus(row.id, 'ERRO', {
        erroMensagem: msg,
        ...(stack !== null ? { erroStack: stack } : {}),
      });
      await this.auditoria.record({
        tabela: 'webhooks_inbox',
        registroId: row.id,
        operacao: 'U',
        diff: {
          evento: 'webhook.reprocessar.erro',
          origem: row.origem,
          erro: msg,
        },
        finalidade: 'webhook.reprocessar.erro',
      });
      this.logger.warn({ uuid, err: msg }, 'webhook.reprocessar.failed');
      return { status: 'ERRO' };
    }
  }

  private async processByOrigem(
    origem: WebhookOrigem,
    tenantId: bigint,
    payload: unknown,
  ): Promise<unknown> {
    switch (origem) {
      case 'TISS_RETORNO':
        return this.tissUC.execute(tenantId, payload);
      case 'LAB_APOIO':
        return this.labUC.execute(tenantId, payload);
      case 'FINANCEIRO':
      case 'GATEWAY_PAGAMENTO':
        return this.finUC.execute(tenantId, payload);
      case 'OUTROS':
      default:
        return { ignored: true, reason: 'Origem OUTROS sem processor.' };
    }
  }
}
