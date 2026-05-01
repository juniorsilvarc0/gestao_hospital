/**
 * `CentroCirurgicoGateway` — Socket.IO gateway que serve o mapa de salas
 * em tempo real.
 *
 * Namespace: `/centro-cirurgico`.
 *
 * Rooms:
 *   - `tenant:<id>:mapa-salas` — operadores conectados ao painel central.
 *
 * Eventos servidor → cliente:
 *   - `cirurgia.agendada`
 *   - `cirurgia.confirmada`
 *   - `cirurgia.iniciada`
 *   - `cirurgia.encerrada`
 *   - `cirurgia.cancelada`
 *   - (auxiliares) `cirurgia.atualizada`, `cirurgia.opme.*`,
 *     `cirurgia.ficha_*` — também relayed para tenant.
 */
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
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
import type { CirurgiaResponse } from '../dto/responses';

const NAMESPACE = '/centro-cirurgico';

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

type AckResult =
  | { status: 'ok'; room: string }
  | { status: 'error'; code: string };

interface CirurgiaEventPayload {
  tenantId: string;
  cirurgia: CirurgiaResponse;
}

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class CentroCirurgicoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CentroCirurgicoGateway.name);
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
        'centro-cirurgico connect',
      );
    } catch (err) {
      this.logger.warn(
        {
          socketId: client.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'centro-cirurgico handshake rejeitado',
      );
      client.emit('auth:error', { code: 'AUTH_INVALID' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(
      { socketId: client.id },
      'centro-cirurgico disconnect',
    );
  }

  @SubscribeMessage('subscribe:mapa-salas')
  async onSubscribeMapa(
    @ConnectedSocket() client: Socket,
  ): Promise<AckResult> {
    const auth = client.data.auth as AuthenticatedSocketData | undefined;
    if (auth === undefined) {
      return { status: 'error', code: 'AUTH_REQUIRED' };
    }
    const room = this.mapaRoom(auth.tenantId.toString());
    await client.join(room);
    return { status: 'ok', room };
  }

  // ────────── Listeners de domínio ──────────

  @OnEvent('cirurgia.agendada')
  handleAgendada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.agendada', payload);
  }

  @OnEvent('cirurgia.confirmada')
  handleConfirmada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.confirmada', payload);
  }

  @OnEvent('cirurgia.iniciada')
  handleIniciada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.iniciada', payload);
  }

  @OnEvent('cirurgia.encerrada')
  handleEncerrada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.encerrada', payload);
  }

  @OnEvent('cirurgia.cancelada')
  handleCancelada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.cancelada', payload);
  }

  @OnEvent('cirurgia.atualizada')
  handleAtualizada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.atualizada', payload);
  }

  @OnEvent('cirurgia.opme.solicitada')
  handleOpmeSolicitada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.opme.solicitada', payload);
  }

  @OnEvent('cirurgia.opme.autorizada')
  handleOpmeAutorizada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.opme.autorizada', payload);
  }

  @OnEvent('cirurgia.opme.utilizada')
  handleOpmeUtilizada(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.opme.utilizada', payload);
  }

  @OnEvent('cirurgia.ficha_cirurgica.preenchida')
  handleFichaCirurgica(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.ficha_cirurgica.preenchida', payload);
  }

  @OnEvent('cirurgia.ficha_anestesica.preenchida')
  handleFichaAnestesica(payload: CirurgiaEventPayload): void {
    this.relay('cirurgia.ficha_anestesica.preenchida', payload);
  }

  /** Emite na room `tenant:<id>:mapa-salas`. */
  relay(eventName: string, payload: CirurgiaEventPayload): void {
    if (this.server === undefined) {
      // Em testes podemos chamar antes do gateway estar pronto.
      return;
    }
    const room = this.mapaRoom(payload.tenantId);
    this.server.to(room).emit(eventName, payload);
  }

  mapaRoom(tenantId: string): string {
    return `tenant:${tenantId}:mapa-salas`;
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
