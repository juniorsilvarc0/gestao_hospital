/**
 * `MapaLeitosGateway` — Socket.IO gateway que serve o **mapa de
 * leitos em tempo real** (UI do hospital, dashboard de gestão de
 * leitos, painéis de bed-control).
 *
 * Namespace:
 *   `/leitos`
 *
 * Autenticação:
 *   JWT no handshake — aceita `socket.handshake.auth.token` ou
 *   `?token=` (mesmo schema do `PainelChamadaGateway` da Fase 4).
 *   Sem token válido → `disconnect`.
 *
 * Rooms:
 *   - `tenant:<id>` — cliente que quer ver TODOS os setores (ex.: bed
 *     manager). Junta-se via `subscribe:tenant`.
 *   - `setor:<id>` — cliente que vê apenas um setor (ex.: posto de
 *     enfermagem da UTI). Junta-se via `subscribe:setor`.
 *
 *   IDs aqui são **BigInt como string**, pois `setores` no schema
 *   atual não tem `uuid_externo` (ver DB.md §7.2 — apenas tabelas com
 *   exposição externa pesada o têm). O nome `setorUuid` pode aparecer
 *   nos docs por convenção, mas o valor é o id interno.
 *
 * Eventos servidor → cliente:
 *   - `leito.alocado`
 *   - `leito.liberado`
 *   - `leito.higienizando`
 *   - `leito.disponivel`
 *   - `leito.manutencao`
 *   - `leito.bloqueado`
 *   - `leito.reservado`
 *
 * Auth check **a cada subscribe**: o tenant do JWT precisa bater com
 * o tenant do recurso (setor). Tentativa cross-tenant → erro silencioso
 * (não revela existência).
 *
 * Adapter:
 *   Usa o `SocketIoRedisAdapter` global registrado no `main.ts` (Fase
 *   4 — Trilha B). Sem configuração extra aqui.
 */
import {
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
import { importSPKI, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import { Server, Socket } from 'socket.io';

import type { Config } from '../../config/configuration';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

const NAMESPACE = '/leitos';

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

interface SubscribeSetorPayload {
  /** BigInt como string (o que existe no schema). */
  setorId: string;
}

type AckResult =
  | { status: 'ok'; room: string }
  | { status: 'error'; code: string };

interface SetorLinha {
  id: bigint;
  tenant_id: bigint;
}

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MapaLeitosGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MapaLeitosGateway.name);
  private verifierPromise?: Promise<{
    key: Uint8Array | KeyLike;
    algorithms: string[];
  }>;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly config: ConfigService<Config, true>,
    private readonly prisma: PrismaService,
  ) {}

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
        'mapa-leitos connect',
      );
    } catch (err) {
      this.logger.warn(
        {
          socketId: client.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'mapa-leitos handshake rejeitado',
      );
      client.emit('auth:error', { code: 'AUTH_INVALID' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug({ socketId: client.id }, 'mapa-leitos disconnect');
  }

  /**
   * Cliente pede para receber TODOS os eventos do tenant. Exigimos
   * apenas que esteja autenticado (papel já checado pela API REST
   * ao buscar o snapshot).
   */
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

  /**
   * Cliente pede para receber eventos apenas do setor X. Validamos
   * que o setor pertence ao tenant antes de aceitar (isolamento).
   */
  @SubscribeMessage('subscribe:setor')
  async onSubscribeSetor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribeSetorPayload,
  ): Promise<AckResult> {
    const auth = client.data.auth as AuthenticatedSocketData | undefined;
    if (auth === undefined) {
      return { status: 'error', code: 'AUTH_REQUIRED' };
    }
    if (typeof body?.setorId !== 'string' || body.setorId.length === 0) {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }
    let setorId: bigint;
    try {
      setorId = BigInt(body.setorId);
    } catch {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }
    if (setorId <= 0n) {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }

    // Setor não tem RLS aplicado neste path (estamos fora do
    // interceptor) — checamos manualmente o `tenant_id`.
    const linhas = await this.prisma.$queryRawUnsafe<SetorLinha[]>(
      `SELECT id, tenant_id
         FROM setores
        WHERE id = $1::bigint
          AND deleted_at IS NULL
        LIMIT 1`,
      setorId,
    );
    const setor = linhas[0];
    if (setor === undefined || setor.tenant_id !== auth.tenantId) {
      return { status: 'error', code: 'SETOR_NOT_FOUND' };
    }
    const room = this.setorRoom(setorId.toString());
    await client.join(room);
    return { status: 'ok', room };
  }

  /** Identificador da room por setor (id interno). */
  setorRoom(setorId: string): string {
    return `setor:${setorId}`;
  }

  /** Identificador da room por tenant. */
  tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  /**
   * API interna usada pelo `MapaLeitosService` para emitir um evento
   * para a room do setor + a room do tenant.
   */
  emitToSetorAndTenant(
    eventName: string,
    setorId: string,
    tenantId: string,
    payload: unknown,
  ): void {
    if (this.server === undefined) {
      // Em testes podemos chamar antes do gateway ter sido inicializado.
      return;
    }
    this.server.to(this.setorRoom(setorId)).emit(eventName, payload);
    this.server.to(this.tenantRoom(tenantId)).emit(eventName, payload);
  }

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
