/**
 * `WebhooksController` — endpoints `/v1/webhooks/*`.
 *
 * Recepção (públicos com HMAC):
 *   POST /v1/webhooks/tiss/retorno
 *   POST /v1/webhooks/lab-apoio/{labUuid}
 *   POST /v1/webhooks/financeiro/pagamento
 *   POST /v1/webhooks/gateway/pagamento
 *
 * Admin:
 *   GET  /v1/webhooks/inbox
 *   GET  /v1/webhooks/inbox/{uuid}
 *   POST /v1/webhooks/inbox/{uuid}/reprocessar
 *
 * Sobre `rawBody`:
 *   O `HmacValidator` precisa do corpo BRUTO recebido para conferir a
 *   assinatura. Em Nest 10 com Express padrão, o JSON parser já
 *   consumiu o corpo — para preservar o raw seria necessário plugar
 *   `bodyParser.verify` em `main.ts` (cf. NestJS docs). Como esta
 *   trilha não pode mexer em main.ts (escopo R-A), usamos
 *   re-serialização determinística via `JSON.stringify` do payload já
 *   parseado.
 *
 *   Implicação: o parceiro precisa assinar o JSON canônico (mesma
 *   ordem de chaves que `JSON.stringify` produz) — o que é a prática
 *   padrão da maioria dos provedores. TODO Fase 13: adotar
 *   `bodyParser.verify` para autenticidade byte-a-byte.
 *
 * Tenant:
 *   Os endpoints públicos exigem `Authorization: Bearer ...` (passa
 *   pelo `JwtAuthGuard` global). O parceiro recebe um JWT de
 *   integração emitido pelo HMS-BR (`tipo_perfil = INTERNO` com
 *   permission `webhooks:receber_*`). O `tenantId` vem do JWT — não
 *   da URL ou header.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { GetWebhookUseCase } from '../../application/get-webhook.use-case';
import { ListWebhooksUseCase } from '../../application/list-webhooks.use-case';
import { ReceiveWebhookUseCase } from '../../application/receive-webhook.use-case';
import { ReprocessarWebhookUseCase } from '../../application/reprocessar-webhook.use-case';
import { WebhookFinanceiroDto } from '../../dto/financeiro.dto';
import { WebhookLabApoioDto } from '../../dto/lab-apoio.dto';
import {
  ListWebhooksQueryDto,
  type WebhookOrigem,
} from '../../dto/list-webhooks.dto';
import { ReprocessarWebhookDto } from '../../dto/reprocessar.dto';
import { WebhookTissRetornoDto } from '../../dto/tiss-retorno.dto';
import type {
  ListWebhooksResponse,
  WebhookDetalheResponse,
  WebhookReceiveResponse,
} from '../../dto/responses';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  constructor(
    private readonly receiveUC: ReceiveWebhookUseCase,
    private readonly listUC: ListWebhooksUseCase,
    private readonly getUC: GetWebhookUseCase,
    private readonly reprocessarUC: ReprocessarWebhookUseCase,
  ) {}

  // ────────────────── Recepção ──────────────────

  @Post('tiss/retorno')
  @RequirePermission('webhooks', 'receber_tiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recebe retorno TISS (recibo + glosas + pagamentos). Idempotente por X-Idempotency-Key.',
  })
  async tissRetorno(
    @Body() body: WebhookTissRetornoDto,
    @Req() req: Request,
  ): Promise<WebhookReceiveResponse> {
    return this.handleReceive('TISS_RETORNO', '/v1/webhooks/tiss/retorno', body, req);
  }

  @Post('lab-apoio/:labUuid')
  @RequirePermission('webhooks', 'receber_lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Recebe resultado de exame de laboratório de apoio. Idempotente por X-Idempotency-Key.',
  })
  async labApoio(
    @Param('labUuid', new ParseUUIDPipe({ version: '4' })) labUuid: string,
    @Body() body: WebhookLabApoioDto,
    @Req() req: Request,
  ): Promise<WebhookReceiveResponse> {
    return this.handleReceive(
      'LAB_APOIO',
      `/v1/webhooks/lab-apoio/${labUuid}`,
      body,
      req,
    );
  }

  @Post('financeiro/pagamento')
  @RequirePermission('webhooks', 'receber_fin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmação de pagamento — origem FINANCEIRO (RM/Fluxus).',
  })
  async financeiro(
    @Body() body: WebhookFinanceiroDto,
    @Req() req: Request,
  ): Promise<WebhookReceiveResponse> {
    return this.handleReceive(
      'FINANCEIRO',
      '/v1/webhooks/financeiro/pagamento',
      body,
      req,
    );
  }

  @Post('gateway/pagamento')
  @RequirePermission('webhooks', 'receber_fin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmação de pagamento — origem GATEWAY_PAGAMENTO (PIX/cartão).',
  })
  async gateway(
    @Body() body: WebhookFinanceiroDto,
    @Req() req: Request,
  ): Promise<WebhookReceiveResponse> {
    return this.handleReceive(
      'GATEWAY_PAGAMENTO',
      '/v1/webhooks/gateway/pagamento',
      body,
      req,
    );
  }

  // ────────────────── Admin ──────────────────

  @Get('inbox')
  @RequirePermission('webhooks', 'admin')
  @ApiOperation({ summary: 'Lista entradas do inbox (paginado).' })
  async list(
    @Query() query: ListWebhooksQueryDto,
  ): Promise<ListWebhooksResponse> {
    return this.listUC.execute(query);
  }

  @Get('inbox/:uuid')
  @RequirePermission('webhooks', 'admin')
  @ApiOperation({
    summary: 'Detalhe completo da entrada (payload, headers, erro_stack).',
  })
  async get(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<{ data: WebhookDetalheResponse }> {
    const data = await this.getUC.execute(uuid);
    return { data };
  }

  @Post('inbox/:uuid/reprocessar')
  @RequirePermission('webhooks', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reprocessa um webhook em estado ERRO. Demais estados retornam 409.',
  })
  async reprocessar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: ReprocessarWebhookDto,
  ): Promise<{
    data: { status: 'PROCESSADO' | 'ERRO'; resultado?: unknown };
  }> {
    const data = await this.reprocessarUC.execute(uuid, dto);
    return { data };
  }

  // ────────────────── helpers ──────────────────

  private async handleReceive(
    origem: WebhookOrigem,
    endpoint: string,
    payload: unknown,
    req: Request,
  ): Promise<WebhookReceiveResponse> {
    if (req.user === undefined) {
      // JwtAuthGuard global garante isso, mas defensivo.
      throw new Error('Webhook controller without authenticated user');
    }
    // Re-serialização determinística — ver header doc do controller.
    const rawBody = JSON.stringify(payload);
    const headers = req.headers as Record<
      string,
      string | string[] | undefined
    >;
    return this.receiveUC.execute({
      origem,
      endpoint,
      headers,
      rawBody,
      payload,
      tenantId: req.user.tid,
    });
  }
}
