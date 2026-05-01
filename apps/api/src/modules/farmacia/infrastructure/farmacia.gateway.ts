/**
 * `FarmaciaGateway` — Socket.IO gateway que serve o painel da farmácia
 * em tempo real.
 *
 * Namespace:
 *   `/farmacia`
 *
 * Autenticação:
 *   JWT no handshake (mesmo schema dos demais gateways da Fase 4/5):
 *   `socket.handshake.auth.token` ou `?token=`. Sem token → disconnect.
 *
 * Rooms:
 *   - `tenant:<id>` — recebe TODOS os eventos do tenant (operador
 *     centralizado). Junta-se via `subscribe:tenant`.
 *   - `tenant:<id>:turno:<TURNO>` — recebe apenas eventos do turno X
 *     (terminal de bancada de um plantão específico). Junta-se via
 *     `subscribe:turno`.
 *
 * Eventos servidor → cliente:
 *   - `dispensacao.criada`
 *   - `dispensacao.separada`
 *   - `dispensacao.dispensada`
 *   - `dispensacao.devolvida`
 *
 * Adapter: usa o `SocketIoRedisAdapter` global registrado no `main.ts`
 * (Fase 4 — Trilha B).
 */
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { importSPKI, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import { Server, Socket } from 'socket.io';

import type { Config } from '../../../config/configuration';
import {
  DISPENSACAO_TURNOS,
  type DispensacaoTurno,
} from '../../farmacia/domain/dispensacao';
import type { DispensacaoResponse } from '../dto/responses';

const NAMESPACE = '/farmacia';

interface AuthenticatedSocketData {
  userId: bigint;
  tenantId: bigint;
  perfis: string[];
}

interface AccessTokenPayload extends JWTPayload {
  sub?: string;
  tid?: string;
  perfis?: string[];
}

interface SubscribeTurnoPayload {
  turno: DispensacaoTurno;
}

type AckResult =
  | { status: 'ok'; room: string }
  | { status: 'error'; code: string };

interface DispensacaoEventPayload {
  tenantId: string;
  dispensacao: DispensacaoResponse;
  originalUuid?: string;
}

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class FarmaciaGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(FarmaciaGateway.name);
  private verifierPromise?: Promise<{
    key: Uint8Array | KeyLike;
    algorithms: string[];
  }>;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly config: ConfigService<Config, true>) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (token === undefined) {
        throw new UnauthorizedException('Token ausente');
      }
      const payload = await this.verifyToken(token);
      const data = this.toSocketData(payload);
      if (data === undefined) {
        throw new UnauthorizedException('Claims inválidas');
      }
      client.data.auth = data;
      this.logger.debug(
        {
          socketId: client.id,
          tenantId: data.tenantId.toString(),
          userId: data.userId.toString(),
        },
        'farmacia connect',
      );
    } catch (err) {
      this.logger.warn(
        {
          socketId: client.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'farmacia handshake rejeitado',
      );
      client.emit('auth:error', { code: 'AUTH_INVALID' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug({ socketId: client.id }, 'farmacia disconnect');
  }

  @SubscribeMessage('subscribe:tenant')
  async onSubscribeTenant(
    @ConnectedSocket() client: Socket,
  ): Promise<AckResult> {
    const auth = client.data.auth as AuthenticatedSocketData | undefined;
    if (auth === undefined) {
      return { status: 'error', code: 'AUTH_REQUIRED' };
    }
    const room = this.tenantRoom(auth.tenantId.toString());
    await client.join(room);
    return { status: 'ok', room };
  }

  @SubscribeMessage('subscribe:turno')
  async onSubscribeTurno(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribeTurnoPayload,
  ): Promise<AckResult> {
    const auth = client.data.auth as AuthenticatedSocketData | undefined;
    if (auth === undefined) {
      return { status: 'error', code: 'AUTH_REQUIRED' };
    }
    if (
      typeof body?.turno !== 'string' ||
      !DISPENSACAO_TURNOS.includes(body.turno as DispensacaoTurno)
    ) {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }
    const room = this.turnoRoom(auth.tenantId.toString(), body.turno);
    await client.join(room);
    return { status: 'ok', room };
  }

  // ────────── Listeners de domínio ──────────

  @OnEvent('dispensacao.criada')
  handleCriada(payload: DispensacaoEventPayload): void {
    this.relay('dispensacao.criada', payload);
  }

  @OnEvent('dispensacao.separada')
  handleSeparada(payload: DispensacaoEventPayload): void {
    this.relay('dispensacao.separada', payload);
  }

  @OnEvent('dispensacao.dispensada')
  handleDispensada(payload: DispensacaoEventPayload): void {
    this.relay('dispensacao.dispensada', payload);
  }

  @OnEvent('dispensacao.devolvida')
  handleDevolvida(payload: DispensacaoEventPayload): void {
    this.relay('dispensacao.devolvida', payload);
  }

  /** Emite tanto na room `tenant:` quanto na específica do turno. */
  relay(eventName: string, payload: DispensacaoEventPayload): void {
    if (this.server === undefined) {
      // Em testes podemos chamar antes do gateway estar pronto.
      return;
    }
    const tenantRoom = this.tenantRoom(payload.tenantId);
    this.server.to(tenantRoom).emit(eventName, payload);
    const turno = payload.dispensacao.turno;
    if (turno !== null) {
      const turnoRoom = this.turnoRoom(payload.tenantId, turno);
      this.server.to(turnoRoom).emit(eventName, payload);
    }
  }

  tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  turnoRoom(tenantId: string, turno: DispensacaoTurno): string {
    return `tenant:${tenantId}:turno:${turno}`;
  }

  // ────────── Helpers privados ──────────

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (
      auth !== undefined &&
      typeof auth.token === 'string' &&
      auth.token.length > 0
    ) {
      return auth.token;
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken;
    }
    return undefined;
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    const { key, algorithms } = await this.getVerifier();
    const { payload } = await jwtVerify(token, key, { algorithms });
    return payload as AccessTokenPayload;
  }

  private async getVerifier(): Promise<{
    key: Uint8Array | KeyLike;
    algorithms: string[];
  }> {
    if (this.verifierPromise === undefined) {
      this.verifierPromise = this.buildVerifier();
    }
    return this.verifierPromise;
  }

  private async buildVerifier(): Promise<{
    key: Uint8Array | KeyLike;
    algorithms: string[];
  }> {
    const publicKeyPem = process.env.JWT_ACCESS_PUBLIC_KEY;
    if (typeof publicKeyPem === 'string' && publicKeyPem.length > 0) {
      const normalized = publicKeyPem.replace(/\\n/g, '\n');
      const key = await importSPKI(normalized, 'EdDSA');
      return { key, algorithms: ['EdDSA'] };
    }
    const secret = this.config.get('JWT_ACCESS_SECRET', { infer: true });
    return {
      key: new TextEncoder().encode(secret),
      algorithms: ['HS256'],
    };
  }

  private toSocketData(
    payload: AccessTokenPayload,
  ): AuthenticatedSocketData | undefined {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.tid !== 'string' ||
      !Array.isArray(payload.perfis)
    ) {
      return undefined;
    }
    let userId: bigint;
    let tenantId: bigint;
    try {
      userId = BigInt(payload.sub);
      tenantId = BigInt(payload.tid);
    } catch {
      return undefined;
    }
    if (userId <= 0n || tenantId <= 0n) {
      return undefined;
    }
    return {
      userId,
      tenantId,
      perfis: payload.perfis.filter(
        (entry): entry is string => typeof entry === 'string',
      ),
    };
  }
}
