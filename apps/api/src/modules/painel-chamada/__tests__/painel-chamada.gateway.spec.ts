/**
 * Unit do `PainelChamadaGateway`.
 *
 * Cobertura:
 *   - subscribe:setor com setor inexistente → status 'error'
 *   - subscribe:setor com setor de outro tenant → status 'error'
 *   - subscribe:setor válido → status 'ok' + client.join chamado com room
 *   - emitirChamada → server.to(room).emit chamado com payload correto
 *
 * Não inicializamos Socket.IO real — mockamos `Server`, `Socket` e
 * `Prisma`. O teste do handshake JWT está coberto indiretamente pelo
 * `JwtAuthGuard.spec` (mesmo schema `jose`).
 */
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  PainelChamadaGateway,
  type PacienteChamadoEvent,
} from '../painel-chamada.gateway';

describe('PainelChamadaGateway', () => {
  function makeGateway(opts?: {
    setorRow?: { id: bigint; uuid_externo: string; tenant_id: bigint };
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
    const gateway = new PainelChamadaGateway(config, prisma);
    return { gateway, prisma };
  }

  function makeSocket(authTenantId: bigint = 1n) {
    return {
      id: 'sock-1',
      data: {
        auth: {
          userId: 100n,
          tenantId: authTenantId,
          perfis: ['RECEPCAO'],
        },
      },
      join: vi.fn(async () => undefined),
    } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribe:setor sem auth → AUTH_REQUIRED', async () => {
    const { gateway } = makeGateway();
    const socket = {
      id: 's',
      data: {},
      join: vi.fn(),
    } as never;
    const r = await gateway.onSubscribeSetor(socket, {
      setorUuid: '00000000-0000-4000-8000-000000000001',
    });
    expect(r).toEqual({ status: 'error', code: 'AUTH_REQUIRED' });
  });

  it('subscribe:setor sem setorUuid → INVALID_PAYLOAD', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeSetor(socket, { setorUuid: '' });
    expect(r).toEqual({ status: 'error', code: 'INVALID_PAYLOAD' });
  });

  it('subscribe:setor inexistente → SETOR_NOT_FOUND', async () => {
    const { gateway } = makeGateway();
    const socket = makeSocket();
    const r = await gateway.onSubscribeSetor(socket, {
      setorUuid: '00000000-0000-4000-8000-000000000099',
    });
    expect(r).toEqual({ status: 'error', code: 'SETOR_NOT_FOUND' });
  });

  it('subscribe:setor de outro tenant → SETOR_NOT_FOUND (isolamento)', async () => {
    const { gateway } = makeGateway({
      setorRow: {
        id: 7n,
        uuid_externo: '00000000-0000-4000-8000-000000000007',
        tenant_id: 999n, // tenant diferente
      },
    });
    const socket = makeSocket(1n); // auth tenant = 1
    const r = await gateway.onSubscribeSetor(socket, {
      setorUuid: '00000000-0000-4000-8000-000000000007',
    });
    expect(r).toEqual({ status: 'error', code: 'SETOR_NOT_FOUND' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('subscribe:setor válido → ok + join na room setor:<uuid>', async () => {
    const setorUuid = '00000000-0000-4000-8000-00000000aaaa';
    const { gateway } = makeGateway({
      setorRow: {
        id: 7n,
        uuid_externo: setorUuid,
        tenant_id: 1n,
      },
    });
    const socket = makeSocket(1n);
    const r = await gateway.onSubscribeSetor(socket, { setorUuid });
    expect(r).toEqual({ status: 'ok' });
    expect(socket.join).toHaveBeenCalledWith(`setor:${setorUuid}`);
  });

  it('emitirChamada delega para server.to(room).emit', () => {
    const { gateway } = makeGateway();
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    // Server é populado pelo @WebSocketServer() — atribuímos manualmente.
    (gateway as unknown as { server: { to: typeof to } }).server = { to };
    const payload: PacienteChamadoEvent = {
      pacienteNome: 'Maria S.',
      senha: '042',
      sala: 'Sala 3',
      hora: '2026-05-01T10:00:00.000Z',
    };
    gateway.emitirChamada('00000000-0000-4000-8000-00000000aaaa', payload);
    expect(to).toHaveBeenCalledWith(
      'setor:00000000-0000-4000-8000-00000000aaaa',
    );
    expect(emit).toHaveBeenCalledWith('paciente.chamado', payload);
  });
});
