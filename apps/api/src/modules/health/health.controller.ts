/**
 * Endpoints de saúde:
 *
 * - `GET /healthz` — liveness. Sempre 200 com timestamp/versão.
 *   Usado pelo Docker HEALTHCHECK e por load balancers.
 *
 * - `GET /readyz`  — readiness. Verifica dependências críticas.
 *   Fase 1: somente Postgres (`SELECT 1`). Redis/MinIO ainda não
 *   têm cliente provisionado no núcleo (BullMQ entra Fase 5+,
 *   storage Fase 6+). Quando entrarem, este endpoint passa a
 *   refleti-los.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

interface HealthSnapshot {
  status: 'ok' | 'degraded';
  version: string;
  timestamp: string;
}

interface ReadinessSnapshot extends HealthSnapshot {
  checks: {
    database: 'up' | 'down';
    // TODO Fase 5+: redis: 'up' | 'down' | 'skipped'
    // TODO Fase 6+: storage: 'up' | 'down' | 'skipped'
  };
}

const API_VERSION = '0.0.1';

@ApiTags('health')
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  liveness(): HealthSnapshot {
    return {
      status: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readyz')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<ReadinessSnapshot> {
    let databaseUp = false;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      databaseUp = true;
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Readiness probe failed: database',
      );
    }

    if (!databaseUp) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        version: API_VERSION,
        timestamp: new Date().toISOString(),
        checks: { database: 'down' },
      });
    }

    return {
      status: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      checks: { database: 'up' },
    };
  }
}
