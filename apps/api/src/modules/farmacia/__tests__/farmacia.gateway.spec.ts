/**
 * Unit do `FarmaciaGateway`.
 *
 * Cobertura:
 *   - subscribe:tenant sem auth → AUTH_REQUIRED
 *   - subscribe:tenant válido → ok
 *   - subscribe:turno inválido → INVALID_PAYLOAD
 *   - subscribe:turno válido → ok
 *   - relay emite em ambas as rooms (tenant + turno)
 *
 * Não inicializamos Socket.IO real — mockamos `Server` e `Socket`.
 */
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FarmaciaGateway } from '../infrastructure/farmacia.gateway';

function makeGateway() {
  const config = {
    get: vi.fn(() => 'fake-secret-min-16-chars-for-hs256'),
  } as unknown as ConfigService;
  const gateway = new FarmaciaGateway(config);
  return gateway;
}

function makeSocket(authTenantId: bigint = 1n) {
  return {
    id: 'sock-1',
    data: {
      auth: {
        userId: 100n,
        tenantId: authTenantId,
        perfis: ['FARMACIA'],
      },
    },
    join: vi.fn(async () => undefined),
  } as never;
}

describe('FarmaciaGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribe:tenant sem auth → AUTH_REQUIRED', async () => {
    const gateway = makeGateway();
    const socket = { id: 's', data: {}, join: vi.fn() } as never;
    const r = await gateway.onSubscribeTenant(socket);
    expect(r).toEqual({ status: 'error', code: 'AUTH_REQUIRED' });
  });

  it('subscribe:tenant retorna room tenant:<id>', async () => {
    const gateway = makeGateway();
    const socket = makeSocket(7n);
    const r = await gateway.onSubscribeTenant(socket);
    expect(r).toEqual({ status: 'ok', room: 'tenant:7' });
  });

  it('subscribe:turno inválido → INVALID_PAYLOAD', async () => {
    const gateway = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeTurno(socket, {
      turno: 'BANANA' as never,
    });
    expect(r).toEqual({ status: 'error', code: 'INVALID_PAYLOAD' });
  });

  it('subscribe:turno válido → ok com room composta', async () => {
    const gateway = makeGateway();
    const socket = makeSocket(7n);
    const r = await gateway.onSubscribeTurno(socket, { turno: 'MANHA' });
    expect(r).toEqual({ status: 'ok', room: 'tenant:7:turno:MANHA' });
  });

  it('relay emite em tenant + turno rooms', () => {
    const gateway = makeGateway();
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    (gateway as unknown as { server: unknown }).server = {
      to: toFn,
    } as unknown;

    gateway.relay('dispensacao.criada', {
      tenantId: '7',
      dispensacao: {
        uuid: 'd',
        atendimentoUuid: 'a',
        pacienteUuid: 'p',
        prescricaoUuid: null,
        cirurgiaUuid: null,
        setorDestinoUuid: null,
        farmaceuticoUuid: 'f',
        dataHora: '2026-04-30T10:00:00Z',
        turno: 'MANHA',
        tipo: 'PRESCRICAO',
        status: 'PENDENTE',
        observacao: null,
        dispensacaoOrigemUuid: null,
        itens: [],
      },
    });
    expect(toFn).toHaveBeenCalledWith('tenant:7');
    expect(toFn).toHaveBeenCalledWith('tenant:7:turno:MANHA');
    expect(emitFn).toHaveBeenCalledTimes(2);
  });

  it('relay sem turno emite apenas em tenant', () => {
    const gateway = makeGateway();
    const emitFn = vi.fn();
    const toFn = vi.fn(() => ({ emit: emitFn }));
    (gateway as unknown as { server: unknown }).server = {
      to: toFn,
    } as unknown;

    gateway.relay('dispensacao.criada', {
      tenantId: '7',
      dispensacao: {
        uuid: 'd',
        atendimentoUuid: 'a',
        pacienteUuid: 'p',
        prescricaoUuid: null,
        cirurgiaUuid: null,
        setorDestinoUuid: null,
        farmaceuticoUuid: 'f',
        dataHora: '2026-04-30T10:00:00Z',
        turno: null,
        tipo: 'PRESCRICAO',
        status: 'PENDENTE',
        observacao: null,
        dispensacaoOrigemUuid: null,
        itens: [],
      },
    });
    expect(toFn).toHaveBeenCalledTimes(1);
    expect(toFn).toHaveBeenCalledWith('tenant:7');
  });
});
