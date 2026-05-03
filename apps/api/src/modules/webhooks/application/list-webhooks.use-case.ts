/**
 * `GET /v1/webhooks/inbox` — listagem paginada (admin).
 */
import { Injectable } from '@nestjs/common';

import type { ListWebhooksQueryDto } from '../dto/list-webhooks.dto';
import type { ListWebhooksResponse } from '../dto/responses';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';
import { presentWebhookInbox } from './webhook.presenter';

@Injectable()
export class ListWebhooksUseCase {
  constructor(private readonly repo: WebhooksRepository) {}

  async execute(query: ListWebhooksQueryDto): Promise<ListWebhooksResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { data, total } = await this.repo.list({
      page,
      pageSize,
      ...(query.origem !== undefined ? { origem: query.origem } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    return {
      data: data.map(presentWebhookInbox),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
