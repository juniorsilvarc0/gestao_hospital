/**
 * Unit do `MapaLeitosGateway`.
 *
 * Cobertura mínima:
 *   - subscribe:tenant sem auth → AUTH_REQUIRED
 *   - subscribe:tenant com auth → ok + join na room tenant:<id>
 *   - subscribe:setor com setor de outro tenant → SETOR_NOT_FOUND
 *   - subscribe:setor válido → ok + join na room setor:<id>
 *   - emitToSetorAndTenant → server.to(...).emit chamado nas 2 rooms
 */
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { MapaLeitosGateway } from '../mapa-leitos.gateway';

describe('MapaLeitosGateway', () => {
  function makeGateway(opts?: {
    setorRow?: { id: bigint; tenant_id: bigint };
  }) {
    const config = {
      get: vi.fn(() => 'fake-secret-min-16-chars-for-hs256'),
    } as unknown as ConfigService;
    const queryRow = opts?.setorRow ?? null;
    const prisma = {
      $queryRawUnsafe: vi.fn(async () =>
        queryRow === null ? [] : [queryRow],
      ),
    } as never;
    const gateway = new MapaLeitosGateway(config, prisma);
    return { gateway, prisma };
  }

  function makeSocket(authTenantId: bigint = 1n) {
    return {
      id: 'sock-1',
      data: {
        auth: {
          userId: 100n,
          tenantId: authTenantId,
          perfis: ['BED_CONTROL'],
        },
      },
      join: vi.fn(async () => undefined),
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribe:tenant sem auth → AUTH_REQUIRED', async () => {
    const { gateway } = makeGateway();
    const socket = { id: 's', data: {}, join: vi.fn() } as never;
    const r = await gateway.onSubscribeTenant(socket);
    expect(r).toEqual({ status: 'error', code: 'AUTH_REQUIRED' });
  });

  it('subscribe:tenant válido → ok + join na room tenant:<id>', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket(7n);
    const r = await gateway.onSubscribeTenant(socket);
    expect(r).toEqual({ status: 'ok', room: 'tenant:7' });
    expect(socket.join).toHaveBeenCalledWith('tenant:7');
  });

  it('subscribe:setor sem auth → AUTH_REQUIRED', async () => {
    const { gateway } = makeGateway();
    const socket = { id: 's', data: {}, join: vi.fn() } as never;
    const r = await gateway.onSubscribeSetor(socket, { setorId: '42' });
    expect(r).toEqual({ status: 'error', code: 'AUTH_REQUIRED' });
  });

  it('subscribe:setor sem setorId → INVALID_PAYLOAD', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeSetor(socket, { setorId: '' });
    expect(r).toEqual({ status: 'error', code: 'INVALID_PAYLOAD' });
  });

  it('subscribe:setor com setorId não-numérico → INVALID_PAYLOAD', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeSetor(socket, { setorId: 'abc' });
    expect(r).toEqual({ status: 'error', code: 'INVALID_PAYLOAD' });
  });

  it('subscribe:setor inexistente → SETOR_NOT_FOUND', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeSetor(socket, { setorId: '99' });
    expect(r).toEqual({ status: 'error', code: 'SETOR_NOT_FOUND' });
  });

  it('subscribe:setor de outro tenant → SETOR_NOT_FOUND (isolamento)', async () => {
    const { gateway } = makeGateway({
      setorRow: { id: 7n, tenant_id: 999n },
    });
    const socket = makeSocket(1n);
    const r = await gateway.onSubscribeSetor(socket, { setorId: '7' });
    expect(r).toEqual({ status: 'error', code: 'SETOR_NOT_FOUND' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('subscribe:setor válido → ok + join na room setor:<id>', async () => {
    const { gateway } = makeGateway({
      setorRow: { id: 7n, tenant_id: 1n },
    });
    const socket = makeSocket(1n);
    const r = await gateway.onSubscribeSetor(socket, { setorId: '7' });
    expect(r).toEqual({ status: 'ok', room: 'setor:7' });
    expect(socket.join).toHaveBeenCalledWith('setor:7');
  });

  it('emitToSetorAndTenant emite em ambas as rooms', () => {
    const { gateway } = makeGateway();
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    (gateway as unknown as { server: { to: typeof to } }).server = { to };
    const payload = { foo: 'bar' };
    gateway.emitToSetorAndTenant('leito.alocado', '7', '1', payload);
    expect(to).toHaveBeenCalledWith('setor:7');
    expect(to).toHaveBeenCalledWith('tenant:1');
    expect(emit).toHaveBeenCalledWith('leito.alocado', payload);
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
