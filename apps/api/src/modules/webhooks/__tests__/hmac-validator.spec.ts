/**
 * Testes do HmacValidator + helpers.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { HmacValidator } from '../domain/hmac-validator';
import {
  extractIdempotencyKey,
  isValidIdempotencyKey,
} from '../domain/idempotency-key';
import {
  canTransition,
  isTerminal,
} from '../domain/webhook-status';

const SECRET = 'test-secret-very-strong-32-chars-min';

function sign(body: string, secret = SECRET, prefix = false): string {
  const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return prefix ? `sha256=${hex}` : hex;
}

describe('HmacValidator', () => {
  const v = new HmacValidator();

  it('rejeita quando secret ausente', () => {
    const r = v.validate({ rawBody: 'x', signatureHeader: 'a', secret: '' });
    expect(r.valid).toBe(false);
  });

  it('rejeita quando header ausente', () => {
    const r = v.validate({
      rawBody: 'x',
      signatureHeader: null,
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  it('rejeita formato hex inválido', () => {
    const r = v.validate({
      rawBody: 'x',
      signatureHeader: 'naohex',
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  it('rejeita HMAC errado', () => {
    const r = v.validate({
      rawBody: '{"a":1}',
      signatureHeader: 'a'.repeat(64),
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) {
      expect(r.reason).toMatch(/não confere/);
    }
  });

  it('aceita HMAC correto sem prefixo', () => {
    const body = '{"foo":"bar"}';
    const r = v.validate({
      rawBody: body,
      signatureHeader: sign(body),
      secret: SECRET,
    });
    expect(r.valid).toBe(true);
  });

  it('aceita HMAC correto com prefixo sha256=', () => {
    const body = '{"foo":"bar"}';
    const r = v.validate({
      rawBody: body,
      signatureHeader: sign(body, SECRET, true),
      secret: SECRET,
    });
    expect(r.valid).toBe(true);
  });
});

describe('extractIdempotencyKey', () => {
  it('prioriza X-Idempotency-Key', () => {
    expect(
      extractIdempotencyKey({
        'x-idempotency-key': 'abc',
        'x-request-id': 'def',
        'x-event-id': 'ghi',
      }),
    ).toBe('abc');
  });

  it('cai para X-Request-Id quando ausente', () => {
    expect(
      extractIdempotencyKey({
        'x-request-id': 'def',
      }),
    ).toBe('def');
  });

  it('retorna null quando vazio/whitespace', () => {
    expect(
      extractIdempotencyKey({
        'x-idempotency-key': '   ',
      }),
    ).toBeNull();
  });

  it('lida com array (multi-valor) pegando o primeiro', () => {
    expect(
      extractIdempotencyKey({
        'x-event-id': ['evt-1', 'evt-2'],
      }),
    ).toBe('evt-1');
  });
});

describe('isValidIdempotencyKey', () => {
  it('aceita UUID-like + dígitos + . - _ :', () => {
    expect(isValidIdempotencyKey('abc-123_456:78.9')).toBe(true);
    expect(isValidIdempotencyKey('a1b2c3-4567-89ab-cdef')).toBe(true);
  });

  it('rejeita espaço e caracteres não permitidos', () => {
    expect(isValidIdempotencyKey('abc 123')).toBe(false);
    expect(isValidIdempotencyKey('abc!')).toBe(false);
  });

  it('rejeita mais de 120 chars', () => {
    expect(isValidIdempotencyKey('a'.repeat(121))).toBe(false);
  });
});

describe('webhook-status state machine', () => {
  it('RECEBIDO → PROCESSANDO/ERRO permitidos', () => {
    expect(canTransition('RECEBIDO', 'PROCESSANDO')).toBe(true);
    expect(canTransition('RECEBIDO', 'ERRO')).toBe(true);
    expect(canTransition('RECEBIDO', 'PROCESSADO')).toBe(false);
  });

  it('PROCESSADO e IGNORADO são terminais', () => {
    expect(isTerminal('PROCESSADO')).toBe(true);
    expect(isTerminal('IGNORADO')).toBe(true);
    expect(isTerminal('ERRO')).toBe(false);
    expect(isTerminal('RECEBIDO')).toBe(false);
  });

  it('ERRO admite reprocessamento', () => {
    expect(canTransition('ERRO', 'PROCESSANDO')).toBe(true);
    expect(canTransition('ERRO', 'PROCESSADO')).toBe(true);
    expect(canTransition('ERRO', 'IGNORADO')).toBe(true);
  });
});
