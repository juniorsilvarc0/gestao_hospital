/**
 * `PainelChamadaGateway` — Socket.IO gateway que serve o painel de
 * chamada de pacientes (TVs em sala de espera).
 *
 * Namespace:
 *   `/painel-chamada`
 *
 * Autenticação:
 *   JWT no handshake — aceita `socket.handshake.auth.token` (recomendado
 *   pelo cliente moderno) **ou** `?token=` na query (fallback p/
 *   embeds legados de TV). Token verificado com `jose` (HS256/EdDSA),
 *   mesmo schema do `JwtAuthGuard`. Sem token → `disconnect`.
 *
 * Rooms por setor:
 *   - Cliente envia `subscribe:setor` com `{ setorUuid }`.
 *   - Gateway resolve o `setor.id` e adiciona o socket em
 *     `room=setor:<uuid>` (mantemos o uuid para evitar vazar IDs
 *     internos).
 *   - Tenant isolation: o servidor checa que o setor pertence ao
 *     tenant do JWT antes de aceitar o subscribe.
 *
 * Eventos:
 *   server → client:
 *     - `paciente.chamado` { pacienteNome, senha, sala, hora }
 *   client → server:
 *     - `subscribe:setor` { setorUuid }   (resposta: ack 'ok' ou 'error')
 *
 * Redis Adapter:
 *   Configurado via `REDIS_URL` para que múltiplas réplicas da API
 *   propaguem `paciente.chamado` umas para as outras. O adapter é
 *   instalado pelo `IoAdapter` customizado em
 *   `painel-chamada.adapter.ts` (registrado em `main.ts`).
 *
 * Não vazar PHI:
 *   `pacienteNome` é o **primeiro nome + iniciais do sobrenome** — a
 *   composição final fica a cargo do `PainelChamadaService` (caller).
 *   O gateway só passa pelo barramento o que vier — espera-se que a
 *   regra de mínima exposição esteja antes.
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

const NAMESPACE = '/painel-chamada';

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
  setorUuid: string;
}

export interface PacienteChamadoEvent {
  pacienteNome: string;
  senha: string;
  sala: string;
  hora: string;
}

interface SetorLinha {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
}

@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PainelChamadaGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PainelChamadaGateway.name);
  private verifierPromise?: Promise<{ key: Uint8Array | KeyLike; algorithms: string[] }>;

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
      // Anexa ao socket para uso posterior. `client.data` é o caminho
      // idiomático do Socket.IO.
      client.data.auth = data;
      this.logger.debug(
        {
          socketId: client.id,
          tenantId: data.tenantId.toString(),
          userId: data.userId.toString(),
        },
        'painel-chamada connect',
      );
    } catch (err) {
      this.logger.warn(
        {
          socketId: client.id,
          err: err instanceof Error ? err.message : String(err),
        },
        'painel-chamada handshake rejeitado',
      );
      client.emit('auth:error', { code: 'AUTH_INVALID' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug({ socketId: client.id }, 'painel-chamada disconnect');
  }

  /**
   * Cliente solicita assinar um setor. Validamos que o setor existe
   * dentro do tenant do JWT antes de juntar à room.
   */
  @SubscribeMessage('subscribe:setor')
  async onSubscribeSetor(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SubscribeSetorPayload,
  ): Promise<{ status: 'ok' } | { status: 'error'; code: string }> {
    const auth = client.data.auth as AuthenticatedSocketData | undefined;
    if (auth === undefined) {
      return { status: 'error', code: 'AUTH_REQUIRED' };
    }
    if (typeof body?.setorUuid !== 'string' || body.setorUuid.length === 0) {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }

    // RLS não está aplicado aqui (gateway fora do interceptor) — checamos
    // explicitamente o `tenant_id`. Setor é tabela cross-cutting (Fase 3).
    const linhas = await this.prisma.$queryRawUnsafe<SetorLinha[]>(
      `
      SELECT id, uuid_externo, tenant_id
        FROM setores
       WHERE uuid_externo = $1::uuid
         AND deleted_at IS NULL
       LIMIT 1
      `,
      body.setorUuid,
    );
    const setor = linhas[0];
    if (setor === undefined || setor.tenant_id !== auth.tenantId) {
      return { status: 'error', code: 'SETOR_NOT_FOUND' };
    }

    await client.join(this.roomFor(body.setorUuid));
    return { status: 'ok' };
  }

  /**
   * API interna usada pelo `PainelChamadaService` para emitir o evento
   * para a room do setor. Mantida no gateway para concentrar acesso ao
   * `server`.
   */
  emitirChamada(setorUuid: string, payload: PacienteChamadoEvent): void {
    this.server.to(this.roomFor(setorUuid)).emit('paciente.chamado', payload);
  }

  private roomFor(setorUuid: string): string {
    return `setor:${setorUuid}`;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (auth !== undefined && typeof auth.token === 'string' && auth.token.length > 0) {
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
