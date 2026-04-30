/**
 * Use cases de `unidades_faturamento` — CRUD genérico.
 *
 * RLS já filtra por tenant via `prisma.tx()`. Não dependemos de
 * `RequestContextStorage` para tenant_id em writes — o trigger
 * preenche `tenant_id` por SET LOCAL no BeforeInsert lógico do RLS.
 *
 * Mas a coluna não tem default no schema: Prisma exige o valor.
 * Por isso lemos do contexto da request.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  CreateUnidadeFaturamentoDto,
  ListUnidadesQueryDto,
  UpdateUnidadeFaturamentoDto,
  UnidadeFaturamentoResponse,
} from '../../dto/unidade.dto';
import {
  PaginatedResponse,
  paginate,
  toBigInt,
} from '../../dto/common';

interface UnidadeFatRow {
  id: bigint;
  codigo: string;
  nome: string;
  cnes: string | null;
  ativa: boolean;
  created_at: Date;
  updated_at: Date | null;
}

function toResponse(row: UnidadeFatRow): UnidadeFaturamentoResponse {
  return {
    id: row.id.toString(),
    codigo: row.codigo,
    nome: row.nome,
    cnes: row.cnes,
    ativa: row.ativa,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error(
      'unidades-faturamento use case requires authenticated request context.',
    );
  }
  return ctx.tenantId;
}

@Injectable()
export class ListUnidadesFaturamentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListUnidadesQueryDto,
  ): Promise<PaginatedResponse<UnidadeFaturamentoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tx = this.prisma.tx();
    const where: Prisma.unidades_faturamentoWhereInput = { deleted_at: null };
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { codigo: { contains: query.search, mode: 'insensitive' } },
        { nome: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.ativa !== undefined) {
      where.ativa = query.ativa;
    }

    const [total, items] = await Promise.all([
      tx.unidades_faturamento.count({ where }),
      tx.unidades_faturamento.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as UnidadeFatRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetUnidadeFaturamentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<UnidadeFaturamentoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.unidades_faturamento.findFirst({
      where: { id, deleted_at: null },
    });
    if (row === null) {
      throw notFound();
    }
    return toResponse(row as UnidadeFatRow);
  }
}

@Injectable()
export class CreateUnidadeFaturamentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    dto: CreateUnidadeFaturamentoDto,
  ): Promise<UnidadeFaturamentoResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();
    try {
      const created = await tx.unidades_faturamento.create({
        data: {
          tenant_id: tenantId,
          codigo: dto.codigo,
          nome: dto.nome,
          cnes: dto.cnes ?? null,
          ativa: dto.ativa ?? true,
        },
      });
      return toResponse(created as UnidadeFatRow);
    } catch (err: unknown) {
      throw mapKnownError(err);
    }
  }
}

@Injectable()
export class UpdateUnidadeFaturamentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    idRaw: string,
    dto: UpdateUnidadeFaturamentoDto,
  ): Promise<UnidadeFaturamentoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.unidades_faturamento.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw notFound();
    }
    const data: Prisma.unidades_faturamentoUpdateInput = {
      updated_at: new Date(),
    };
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.cnes !== undefined) data.cnes = dto.cnes;
    if (dto.ativa !== undefined) data.ativa = dto.ativa;
    try {
      const updated = await tx.unidades_faturamento.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as UnidadeFatRow);
    } catch (err: unknown) {
      throw mapKnownError(err);
    }
  }
}

@Injectable()
export class DeleteUnidadeFaturamentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.unidades_faturamento.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw notFound();
    }
    await tx.unidades_faturamento.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), ativa: false },
    });
  }
}

function parseId(raw: string): bigint {
  try {
    return toBigInt(raw);
  } catch {
    throw notFound();
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'UNIDADE_FATURAMENTO_NOT_FOUND',
    message: 'Unidade de faturamento não encontrada.',
  });
}

function mapKnownError(err: unknown): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return new ConflictException({
      code: 'UNIDADE_FATURAMENTO_CODIGO_TAKEN',
      message: 'Já existe uma unidade de faturamento com este código.',
    });
  }
  return err;
}
