/**
 * `GET /v1/webhooks/inbox/{uuid}` — detalhe (admin), inclui payload e
 * stack do erro.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import type { WebhookDetalheResponse } from '../dto/responses';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';
import { presentWebhookDetalhe } from './webhook.presenter';

@Injectable()
export class GetWebhookUseCase {
  constructor(private readonly repo: WebhooksRepository) {}

  async execute(uuid: string): Promise<WebhookDetalheResponse> {
    const row = await this.repo.findByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'WEBHOOK_NAO_ENCONTRADO',
        message: 'Webhook não encontrado.',
      });
    }
    return presentWebhookDetalhe(row);
  }
}
