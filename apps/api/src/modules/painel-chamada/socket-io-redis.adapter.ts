/**
 * `SocketIoRedisAdapter` — adapter customizado de Socket.IO com Redis
 * pub/sub atrás. Necessário para que múltiplas réplicas da API
 * propaguem `emit(...)` umas para as outras (configuração obrigatória
 * em produção; útil em dev para validar o caminho).
 *
 * Lê `REDIS_URL` direto do env (mesma fonte que o `QueuesModule`).
 *
 * Por que `Adapter` separado e não dentro do gateway?
 *   `IoAdapter` é a forma como o NestJS troca a implementação
 *   subjacente do Socket.IO (e.g. WS-only vs polling, eventos
 *   externos). Aplica a TODOS os gateways da app — então definir
 *   aqui evita duplicação quando outros módulos (mapa de leitos,
 *   farmácia) também tiverem Socket.IO.
 */
import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions, Server } from 'socket.io';

export class SocketIoRedisAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379/0';
    this.pub = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.sub = this.pub.duplicate();
    // Garante que ambos estão conectados antes de criar o adapter.
    await Promise.all([
      this.pub.status === 'ready' ? Promise.resolve() : new Promise<void>((r) => this.pub!.once('ready', () => r())),
      this.sub.status === 'ready' ? Promise.resolve() : new Promise<void>((r) => this.sub!.once('ready', () => r())),
    ]);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.pub !== undefined && this.sub !== undefined) {
      server.adapter(createAdapter(this.pub, this.sub));
    }
    return server;
  }

  async dispose(): Promise<void> {
    if (this.pub !== undefined) {
      await this.pub.quit();
    }
    if (this.sub !== undefined) {
      await this.sub.quit();
    }
  }
}
