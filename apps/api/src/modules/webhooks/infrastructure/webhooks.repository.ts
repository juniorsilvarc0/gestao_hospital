/**
 * `WebhooksRepository` — fonte única de SQL do módulo webhooks.
 *
 * Convenções:
 *   - INSERT da entrada usa `ON CONFLICT (tenant_id, origem,
 *     idempotency_key) DO NOTHING` para garantir idempotência. O caller
 *     compara `xmax = 0` (nova linha) ou faz SELECT de fallback.
 *   - Updates marcam timestamps automaticamente.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { WebhookOrigem } from '../dto/list-webhooks.dto';
import type { WebhookStatus } from '../domain/webhook-status';

export interface InsertInboxInput {
  tenantId: bigint;
  origem: WebhookOrigem;
  idempotencyKey: string;
  endpoint: string;
  payload: unknown;
  headers: Record<string, unknown> | null;
  signature: string | null;
}

export interface InboxRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  origem: string;
  idempotency_key: string;
  endpoint: string;
  payload: unknown;
  headers: unknown;
  signature: string | null;
  status: string;
  data_recebimento: Date;
  data_processamento: Date | null;
  tentativas: number;
  erro_mensagem: string | null;
  erro_stack: string | null;
  resultado: unknown;
  created_at: Date;
}

@Injectable()
export class WebhooksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insere ou retorna o registro existente (idempotência).
   *
   * Retorna `{ row, created }`:
   *   - created = true → registro NOVO (insert efetivo);
   *   - created = false → conflict (idempotency duplicada).
   */
  async upsertInbox(
    input: InsertInboxInput,
  ): Promise<{ row: InboxRow; created: boolean }> {
    const tx = this.prisma.tx();
    // Tenta inserir; se conflito, devolve a linha existente.
    const inserted = await tx.$queryRaw<InboxRow[]>`
      INSERT INTO webhooks_inbox
        (tenant_id, origem, idempotency_key, endpoint, payload, headers, signature)
      VALUES
        (${input.tenantId}::bigint,
         ${input.origem}::enum_webhook_origem,
         ${input.idempotencyKey},
         ${input.endpoint},
         ${JSON.stringify(input.payload)}::jsonb,
         ${input.headers === null ? null : JSON.stringify(input.headers)}::jsonb,
         ${input.signature})
      ON CONFLICT (tenant_id, origem, idempotency_key) DO NOTHING
      RETURNING id, uuid_externo::text AS uuid_externo, tenant_id,
                origem::text AS origem,
                idempotency_key, endpoint, payload, headers, signature,
                status::text AS status,
                data_recebimento, data_processamento, tentativas,
                erro_mensagem, erro_stack, resultado, created_at
    `;
    if (inserted.length > 0) {
      return { row: inserted[0], created: true };
    }
    // Conflito: re-busca o registro original.
    const existing = await tx.$queryRaw<InboxRow[]>`
      SELECT id, uuid_externo::text AS uuid_externo, tenant_id,
             origem::text AS origem,
             idempotency_key, endpoint, payload, headers, signature,
             status::text AS status,
             data_recebimento, data_processamento, tentativas,
             erro_mensagem, erro_stack, resultado, created_at
        FROM webhooks_inbox
       WHERE tenant_id = ${input.tenantId}::bigint
         AND origem = ${input.origem}::enum_webhook_origem
         AND idempotency_key = ${input.idempotencyKey}
       LIMIT 1
    `;
    if (existing.length === 0) {
      throw new Error('Idempotency conflict mas registro original não localizado.');
    }
    return { row: existing[0], created: false };
  }

  async findByUuid(uuid: string): Promise<InboxRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<InboxRow[]>`
      SELECT id, uuid_externo::text AS uuid_externo, tenant_id,
             origem::text AS origem,
             idempotency_key, endpoint, payload, headers, signature,
             status::text AS status,
             data_recebimento, data_processamento, tentativas,
             erro_mensagem, erro_stack, resultado, created_at
        FROM webhooks_inbox
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async list(args: {
    origem?: WebhookOrigem;
    status?: WebhookStatus;
    page: number;
    pageSize: number;
  }): Promise<{ data: InboxRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (args.origem !== undefined) {
      where.push(
        Prisma.sql`origem = ${args.origem}::enum_webhook_origem`,
      );
    }
    if (args.status !== undefined) {
      where.push(
        Prisma.sql`status = ${args.status}::enum_webhook_status`,
      );
    }
    const whereSql = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM webhooks_inbox WHERE ${whereSql}`,
      ),
      tx.$queryRaw<InboxRow[]>(
        Prisma.sql`
          SELECT id, uuid_externo::text AS uuid_externo, tenant_id,
                 origem::text AS origem,
                 idempotency_key, endpoint, payload, headers, signature,
                 status::text AS status,
                 data_recebimento, data_processamento, tentativas,
                 erro_mensagem, erro_stack, resultado, created_at
            FROM webhooks_inbox
           WHERE ${whereSql}
           ORDER BY data_recebimento DESC, id DESC
           LIMIT ${args.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);
    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async markStatus(
    id: bigint,
    status: WebhookStatus,
    payload?: {
      resultado?: unknown;
      erroMensagem?: string;
      erroStack?: string;
      incrementarTentativa?: boolean;
    },
  ): Promise<void> {
    const tx = this.prisma.tx();
    const incrementar = payload?.incrementarTentativa === true;
    const resultado =
      payload?.resultado === undefined
        ? null
        : JSON.stringify(payload.resultado);
    const erroMensagem = payload?.erroMensagem ?? null;
    const erroStack = payload?.erroStack ?? null;

    await tx.$executeRaw`
      UPDATE webhooks_inbox
         SET status             = ${status}::enum_webhook_status,
             data_processamento = COALESCE(data_processamento, now()),
             tentativas         = tentativas + (CASE WHEN ${incrementar} THEN 1 ELSE 0 END),
             resultado          = COALESCE(${resultado}::jsonb, resultado),
             erro_mensagem      = ${erroMensagem},
             erro_stack         = ${erroStack}
       WHERE id = ${id}::bigint
    `;
  }

  // ───────── helpers de processamento (TISS / LAB / Financeiro) ─────────

  async findLoteTissByNumero(
    loteNumero: string,
  ): Promise<{ id: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM lotes_tiss
       WHERE numero_lote = ${loteNumero}
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async updateLoteProtocolo(
    loteId: bigint,
    protocolo: string,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE lotes_tiss
         SET protocolo_operadora = ${protocolo},
             updated_at          = now()
       WHERE id = ${loteId}::bigint
    `;
  }

  async findContaIdByNumero(numero: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id
        FROM contas
       WHERE numero_conta = ${numero}
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findContaStatusById(
    id: bigint,
  ): Promise<{ status: string; valor_total: string } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ status: string; valor_total: string }[]>`
      SELECT status::text AS status,
             valor_total::text AS valor_total
        FROM contas
       WHERE id = ${id}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async marcarContaPaga(input: {
    contaId: bigint;
    valorPago: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET status     = 'PAGA'::enum_conta_status,
             valor_pago = ${input.valorPago}::numeric,
             updated_at = now()
       WHERE id = ${input.contaId}::bigint
    `;
  }

  // ── Lab apoio
  async findSolicitacaoExameByCodigo(
    codigo: string,
  ): Promise<{ id: bigint; paciente_id: bigint } | null> {
    const tx = this.prisma.tx();
    // `codigo` pode ser numero_guia OU uuid_externo (best-effort).
    const rows = await tx.$queryRaw<
      { id: bigint; paciente_id: bigint }[]
    >`
      SELECT id, paciente_id
        FROM solicitacoes_exame
       WHERE numero_guia = ${codigo}
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findItemBySolicitacaoAndProcedimento(
    solicitacaoId: bigint,
    codigo: string,
  ): Promise<{ id: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT i.id
        FROM solicitacoes_exame_itens i
        JOIN tabelas_procedimentos tp ON tp.id = i.procedimento_id
       WHERE i.solicitacao_id = ${solicitacaoId}::bigint
         AND tp.codigo_tuss = ${codigo}
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findItemByUuid(uuid: string): Promise<{
    id: bigint;
    solicitacao_id: bigint;
    paciente_id: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; solicitacao_id: bigint; paciente_id: bigint }[]
    >`
      SELECT i.id, i.solicitacao_id, s.paciente_id
        FROM solicitacoes_exame_itens i
        JOIN solicitacoes_exame s ON s.id = i.solicitacao_id
       WHERE i.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async insertResultadoExterno(input: {
    tenantId: bigint;
    solicitacaoItemId: bigint;
    pacienteId: bigint;
    laudoTexto: string;
    laudoEstruturado: unknown;
    laudoPdfUrl: string | null;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO resultados_exame (
        tenant_id, solicitacao_item_id, paciente_id,
        laudo_texto, laudo_estruturado, laudo_pdf_url, status
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.solicitacaoItemId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.laudoTexto},
        ${JSON.stringify(input.laudoEstruturado)}::jsonb,
        ${input.laudoPdfUrl},
        'LAUDO_FINAL'::enum_solicitacao_exame_status
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }
}
