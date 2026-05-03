/**
 * Testa `ReceiveWebhookUseCase`:
 *   - Sem idempotency-key → 400.
 *   - Idempotency conflict → status: 'duplicate'.
 *   - HMAC inválido → 401 + ERRO no inbox.
 *   - HMAC válido + processor sucesso → status: 'received', PROCESSADO.
 *   - HMAC válido + processor falha → status: 'rejected', ERRO no inbox.
 */
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReceiveWebhookUseCase } from '../application/receive-webhook.use-case';

const TENANT_ID = 7n;
const SECRET = 'test-secret-very-strong-32-chars-min';
const PAYLOAD = { foo: 'bar' };
const RAW_BODY = JSON.stringify(PAYLOAD);

function makeAuditoria() {
  return { record: vi.fn(async () => undefined) };
}

function makeRepo(overrides: {
  upsertResult?: 'new' | 'duplicate';
  duplicateResult?: unknown;
} = {}) {
  const result = overrides.upsertResult ?? 'new';
  return {
    upsertInbox: vi.fn(async () => ({
      row: {
        id: 1n,
        uuid_externo: '11111111-1111-4111-8111-111111111111',
        tenant_id: TENANT_ID,
        origem: 'TISS_RETORNO',
        idempotency_key: 'idem-1',
        endpoint: '/v1/webhooks/tiss/retorno',
        payload: PAYLOAD,
        headers: {},
        signature: 'sig',
        status: result === 'new' ? 'RECEBIDO' : 'PROCESSADO',
        data_recebimento: new Date(),
        data_processamento: result === 'new' ? null : new Date(),
        tentativas: 0,
        erro_mensagem: null,
        erro_stack: null,
        resultado: overrides.duplicateResult ?? null,
        created_at: new Date(),
      },
      created: result === 'new',
    })),
    markStatus: vi.fn(async () => undefined),
  };
}

function makeSecrets(secret: string | null) {
  return { resolve: vi.fn(() => secret) };
}

function makeProcessor(succeeds: boolean) {
  return {
    execute: vi.fn(async () => {
      if (succeeds) return { ok: true };
      throw new Error('boom');
    }),
  };
}

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

describe('ReceiveWebhookUseCase', () => {
  let auditoria: ReturnType<typeof makeAuditoria>;
  beforeEach(() => {
    auditoria = makeAuditoria();
  });

  it('400 quando idempotency-key ausente', async () => {
    const repo = makeRepo();
    const uc = new ReceiveWebhookUseCase(
      repo as never,
      makeSecrets(SECRET) as never,
      auditoria as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
    );
    await expect(
      uc.execute({
        origem: 'TISS_RETORNO',
        endpoint: '/v1/webhooks/tiss/retorno',
        headers: {},
        rawBody: RAW_BODY,
        payload: PAYLOAD,
        tenantId: TENANT_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.upsertInbox).not.toHaveBeenCalled();
  });

  it("retorna 'duplicate' quando idempotency conflitante", async () => {
    const repo = makeRepo({
      upsertResult: 'duplicate',
      duplicateResult: { ok: 'previous' },
    });
    const uc = new ReceiveWebhookUseCase(
      repo as never,
      makeSecrets(SECRET) as never,
      auditoria as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
    );
    const out = await uc.execute({
      origem: 'TISS_RETORNO',
      endpoint: '/v1/webhooks/tiss/retorno',
      headers: { 'x-idempotency-key': 'idem-1', 'x-signature': sign(RAW_BODY) },
      rawBody: RAW_BODY,
      payload: PAYLOAD,
      tenantId: TENANT_ID,
    });
    expect(out.status).toBe('duplicate');
    expect(out.uuid).toBe('11111111-1111-4111-8111-111111111111');
    // Não chama markStatus (não toca em status).
    expect(repo.markStatus).not.toHaveBeenCalled();
  });

  it('401 quando HMAC inválido + marca ERRO no inbox', async () => {
    const repo = makeRepo();
    const uc = new ReceiveWebhookUseCase(
      repo as never,
      makeSecrets(SECRET) as never,
      auditoria as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
    );
    await expect(
      uc.execute({
        origem: 'TISS_RETORNO',
        endpoint: '/v1/webhooks/tiss/retorno',
        headers: {
          'x-idempotency-key': 'idem-1',
          'x-signature': 'a'.repeat(64),
        },
        rawBody: RAW_BODY,
        payload: PAYLOAD,
        tenantId: TENANT_ID,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.markStatus).toHaveBeenCalledWith(
      1n,
      'ERRO',
      expect.objectContaining({
        erroMensagem: expect.stringMatching(/HMAC/),
      }),
    );
  });

  it('processa e marca PROCESSADO quando tudo OK', async () => {
    const repo = makeRepo();
    const tissProc = makeProcessor(true);
    const uc = new ReceiveWebhookUseCase(
      repo as never,
      makeSecrets(SECRET) as never,
      auditoria as never,
      tissProc as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
    );
    const out = await uc.execute({
      origem: 'TISS_RETORNO',
      endpoint: '/v1/webhooks/tiss/retorno',
      headers: { 'x-idempotency-key': 'idem-1', 'x-signature': sign(RAW_BODY) },
      rawBody: RAW_BODY,
      payload: PAYLOAD,
      tenantId: TENANT_ID,
    });
    expect(out.status).toBe('received');
    expect(tissProc.execute).toHaveBeenCalledWith(TENANT_ID, PAYLOAD);
    expect(repo.markStatus).toHaveBeenCalledWith(
      1n,
      'PROCESSANDO',
      expect.objectContaining({ incrementarTentativa: true }),
    );
    expect(repo.markStatus).toHaveBeenCalledWith(
      1n,
      'PROCESSADO',
      expect.objectContaining({ resultado: { ok: true } }),
    );
  });

  it("retorna 'rejected' e marca ERRO quando processor falha", async () => {
    const repo = makeRepo();
    const tissProc = makeProcessor(false);
    const uc = new ReceiveWebhookUseCase(
      repo as never,
      makeSecrets(SECRET) as never,
      auditoria as never,
      tissProc as never,
      makeProcessor(true) as never,
      makeProcessor(true) as never,
    );
    const out = await uc.execute({
      origem: 'TISS_RETORNO',
      endpoint: '/v1/webhooks/tiss/retorno',
      headers: { 'x-idempotency-key': 'idem-1', 'x-signature': sign(RAW_BODY) },
      rawBody: RAW_BODY,
      payload: PAYLOAD,
      tenantId: TENANT_ID,
    });
    expect(out.status).toBe('rejected');
    expect(repo.markStatus).toHaveBeenCalledWith(
      1n,
      'ERRO',
      expect.objectContaining({
        erroMensagem: 'boom',
      }),
    );
  });
});
