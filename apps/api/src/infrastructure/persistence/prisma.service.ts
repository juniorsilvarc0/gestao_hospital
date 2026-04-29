/**
 * Prisma client wrapper para NestJS.
 *
 * - `onModuleInit`/`onModuleDestroy` cuidam do ciclo de vida da conexão.
 * - Soft-delete global é aplicado via `$extends` (query extension —
 *   substitui o `$use` deprecated em Prisma 5.x). Toda operação de
 *   leitura recebe `deletedAt: null` automaticamente; updates/deletes
 *   também passam a respeitar o filtro.
 * - `$extends` retorna um cliente novo, então expomos `withSoftDelete`
 *   para os repositórios; o `PrismaClient` cru permanece disponível
 *   para casos excepcionais (migrações, seeds, jobs administrativos).
 */
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Modelos que carregam `deleted_at` (soft-delete). Demais modelos
// (perfis/permissoes/joins/sessoes_ativas) são catálogo ou efêmeros e
// não devem ter o filtro injetado.
const SOFT_DELETE_MODELS = new Set<string>(['Tenant', 'Usuario']);

const READ_OPERATIONS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_OPERATIONS_FILTERED = new Set<string>([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}

/**
 * Aplica o filtro de soft-delete em qualquer cliente Prisma.
 * Exportado como função pura para que módulos que precisem de um
 * cliente "cru" (ex.: seed, migrations, audit log) possam optar.
 */
export function withSoftDelete<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'softDeleteFilter',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model === undefined || !SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }
          if (READ_OPERATIONS.has(operation)) {
            return query(injectDeletedAtFilter(args));
          }
          if (WRITE_OPERATIONS_FILTERED.has(operation)) {
            return query(injectDeletedAtFilter(args));
          }
          return query(args);
        },
      },
    },
  });
}

type WithWhere = { where?: Record<string, unknown> };

function injectDeletedAtFilter<TArgs>(args: TArgs): TArgs {
  if (typeof args !== 'object' || args === null) {
    return args;
  }
  const argsWithWhere = args as TArgs & WithWhere;
  const existingWhere = argsWithWhere.where ?? {};
  if ('deletedAt' in existingWhere) {
    return args;
  }
  return {
    ...argsWithWhere,
    where: { ...existingWhere, deletedAt: null },
  } as TArgs;
}
