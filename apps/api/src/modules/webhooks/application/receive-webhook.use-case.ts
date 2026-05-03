/**
 * `ReceiveWebhookUseCase` — entrada genérica de qualquer webhook.
 *
 * Fluxo:
 *   1. Extrai `idempotencyKey` dos headers (`X-Idempotency-Key`,
 *      `X-Request-Id` ou `X-Event-Id`); valida formato.
 *   2. INSERT idempotente em `webhooks_inbox`. Conflict ⇒ devolve
 *      `{ status: 'duplicate' }` apontando para o registro original e
 *      ENCERRA — nada é processado novamente.
 *   3. Valida HMAC `X-Signature` contra `secret` da origem (env var por
 *      origem). Falha ⇒ marca status `ERRO` no inbox + UnauthorizedException
 *      (401 com `reason`).
 *   4. Marca `PROCESSANDO` (com tentativa) e delega ao processor
 *      específico (TISS / LAB / FIN). Sucesso ⇒ `PROCESSADO` + resultado;
 *      falha ⇒ `ERRO` com mensagem.
 *
 * Decisões:
 *   - **Processamento INLINE (não enfileirado)**. Em Phase 11 inicial
 *     priorizamos simplicidade — chamada externa nunca acontece DENTRO
 *     da request porque o handler corre em transação Postgres aberta.
 *     Os processors deste módulo só fazem I/O com o BD local, então é
 *     seguro rodar inline. TODO Fase 13: enfileirar via BullMQ
 *     (`webhook-processor`) para isolar carga e ganhar retry com
 *     backoff exponencial.
 *
 *   - **Tenant**: derivado do JWT (handler está autenticado por
 *     `JwtAuthGuard` apesar do `@Public()` lógico). Para webhooks
 *     verdadeiramente públicos (sem JWT), o `tenant_id` viria de
 *     header `X-Tenant-Id` ou da própria URL (ex.:
 *     `/v1/webhooks/lab-apoio/{labUuid}` mapeia para tenant via
 *     cadastro do lab). O caller passa `tenantId` para evitar
 *     acoplamento com a forma de obter.
 *
 *   - **Auditoria**: `webhook.recebido` (na chegada) e
 *     `webhook.processado` (no fim, com status). PHI evitada — o
 *     payload bruto fica na tabela mas NÃO é replicado em
 *     `auditoria_eventos`.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';

import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { HmacValidator } from '../domain/hmac-validator';
import {
  extractIdempotencyKey,
  isValidIdempotencyKey,
} from '../domain/idempotency-key';
import type { WebhookOrigem } from '../dto/list-webhooks.dto';
import type { WebhookReceiveResponse } from '../dto/responses';
import { WebhookSecretsService } from '../infrastructure/webhook-secrets.service';
import { WebhooksRepository } from '../infrastructure/webhooks.repository';
import { ProcessTissRetornoUseCase } from './process-tiss-retorno.use-case';
import { ProcessLabApoioUseCase } from './process-lab-apoio.use-case';
import { ProcessFinanceiroUseCase } from './process-financeiro.use-case';

export interface ReceiveWebhookInput {
  origem: WebhookOrigem;
  endpoint: string;
  /** Headers brutos da request (usado p/ extrair idempotency + signature). */
  headers: Record<string, string | string[] | undefined>;
  /**
   * Corpo bruto (string) — usado para validar HMAC antes de qualquer
   * deserialização. O controller é responsável por capturar com
   * `rawBody`.
   */
  rawBody: string;
  /** Payload já parseado e validado pelo DTO. */
  payload: unknown;
  /** Tenant resolvido pelo controller (do JWT). */
  tenantId: bigint;
}

@Injectable()
export class ReceiveWebhookUseCase {
  private readonly logger = new Logger(ReceiveWebhookUseCase.name);
  private readonly hmac = new HmacValidator();

  constructor(
    private readonly repo: WebhooksRepository,
    private readonly secrets: WebhookSecretsService,
    private readonly auditoria: AuditoriaService,
    @Inject(forwardRef(() => ProcessTissRetornoUseCase))
    private readonly tissUC: ProcessTissRetornoUseCase,
    @Inject(forwardRef(() => ProcessLabApoioUseCase))
    private readonly labUC: ProcessLabApoioUseCase,
    @Inject(forwardRef(() => ProcessFinanceiroUseCase))
    private readonly finUC: ProcessFinanceiroUseCase,
  ) {}

  async execute(
    input: ReceiveWebhookInput,
  ): Promise<WebhookReceiveResponse> {
    const idempotencyKey = extractIdempotencyKey(input.headers);
    if (idempotencyKey === null || !isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException({
        code: 'WEBHOOK_IDEMPOTENCY_KEY_REQUIRED',
        message:
          'Header X-Idempotency-Key (ou X-Request-Id / X-Event-Id) é obrigatório.',
      });
    }

    const signature = pickHeader(input.headers, 'x-signature');

    // 1. INSERT idempotente.
    const { row, created } = await this.repo.upsertInbox({
      tenantId: input.tenantId,
      origem: input.origem,
      idempotencyKey,
      endpoint: input.endpoint,
      payload: input.payload,
      headers: sanitizeHeaders(input.headers),
      signature,
    });

    if (!created) {
      // Duplicata — o registro original responde por este request.
      return {
        status: 'duplicate',
        uuid: row.uuid_externo,
        message: 'Webhook já recebido anteriormente (idempotency).',
        resultado: row.resultado,
      };
    }

    // 2. Audit chegada (sem payload PHI).
    await this.auditoria.record({
      tabela: 'webhooks_inbox',
      registroId: row.id,
      operacao: 'I',
      diff: {
        evento: 'webhook.recebido',
        origem: input.origem,
        endpoint: input.endpoint,
        idempotency_key: idempotencyKey,
      },
      finalidade: 'webhook.recebido',
    });

    // 3. HMAC.
    const secret = this.secrets.resolve(input.origem, input.tenantId);
    const validation = this.hmac.validate({
      rawBody: input.rawBody,
      signatureHeader: signature,
      secret,
    });
    if (!validation.valid) {
      await this.repo.markStatus(row.id, 'ERRO', {
        erroMensagem: `HMAC inválido: ${validation.reason}`,
        incrementarTentativa: true,
      });
      throw new UnauthorizedException({
        code: 'WEBHOOK_HMAC_INVALIDO',
        message: validation.reason,
      });
    }

    // 4. Processamento INLINE.
    await this.repo.markStatus(row.id, 'PROCESSANDO', {
      incrementarTentativa: true,
    });

    let processResult: unknown;
    try {
      processResult = await this.processByOrigem(
        input.origem,
        input.tenantId,
        input.payload,
      );
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
          evento: 'webhook.processado',
          status: 'ERRO',
          origem: input.origem,
          erro: msg,
        },
        finalidade: 'webhook.processado',
      });
      this.logger.error(
        {
          err: msg,
          origem: input.origem,
          inboxUuid: row.uuid_externo,
        },
        'webhook.process.failed',
      );
      // Não rethrow — devolvemos 200 com `status: 'rejected'` para que
      // o parceiro saiba que o registro foi guardado e a admin pode
      // reprocessar. (Em alguns provedores TISS rethrow gera retry
      // imediato e duplica entrada.)
      return {
        status: 'rejected',
        uuid: row.uuid_externo,
        message: `Falha no processamento: ${msg}`,
      };
    }

    await this.repo.markStatus(row.id, 'PROCESSADO', {
      resultado: processResult,
    });
    await this.auditoria.record({
      tabela: 'webhooks_inbox',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'webhook.processado',
        status: 'PROCESSADO',
        origem: input.origem,
      },
      finalidade: 'webhook.processado',
    });

    return {
      status: 'received',
      uuid: row.uuid_externo,
      message: 'Webhook processado com sucesso.',
      resultado: processResult,
    };
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

function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  // Mantemos apenas headers úteis para auditoria — evita guardar
  // `cookie`/`authorization`.
  const allow = new Set([
    'x-idempotency-key',
    'x-request-id',
    'x-event-id',
    'x-signature',
    'x-forwarded-for',
    'user-agent',
    'content-type',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (allow.has(k.toLowerCase())) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}
