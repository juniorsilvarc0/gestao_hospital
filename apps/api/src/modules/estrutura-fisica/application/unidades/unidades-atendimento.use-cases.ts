/**
 * Use cases de `unidades_atendimento` — CRUD genérico.
 * Mesmo padrão da unidade de faturamento, sem o campo CNES.
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
  CreateUnidadeAtendimentoDto,
  ListUnidadesQueryDto,
  UpdateUnidadeAtendimentoDto,
  UnidadeAtendimentoResponse,
} from '../../dto/unidade.dto';
import {
  PaginatedResponse,
  paginate,
  toBigInt,
} from '../../dto/common';

interface UnidadeAtRow {
  id: bigint;
  codigo: string;
  nome: string;
  ativa: boolean;
  created_at: Date;
  updated_at: Date | null;
}

function toResponse(row: UnidadeAtRow): UnidadeAtendimentoResponse {
  return {
    id: row.id.toString(),
    codigo: row.codigo,
    nome: row.nome,
    ativa: row.ativa,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error(
      'unidades-atendimento use case requires authenticated request context.',
    );
  }
  return ctx.tenantId;
}

@Injectable()
export class ListUnidadesAtendimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListUnidadesQueryDto,
  ): Promise<PaginatedResponse<UnidadeAtendimentoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const tx = this.prisma.tx();
    const where: Prisma.unidades_atendimentoWhereInput = { deleted_at: null };
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
      tx.unidades_atendimento.count({ where }),
      tx.unidades_atendimento.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as UnidadeAtRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetUnidadeAtendimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<UnidadeAtendimentoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.unidades_atendimento.findFirst({
      where: { id, deleted_at: null },
    });
    if (row === null) {
      throw notFound();
    }
    return toResponse(row as UnidadeAtRow);
  }
}

@Injectable()
export class CreateUnidadeAtendimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    dto: CreateUnidadeAtendimentoDto,
  ): Promise<UnidadeAtendimentoResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();
    try {
      const created = await tx.unidades_atendimento.create({
        data: {
          tenant_id: tenantId,
          codigo: dto.codigo,
          nome: dto.nome,
          ativa: dto.ativa ?? true,
        },
      });
      return toResponse(created as UnidadeAtRow);
    } catch (err: unknown) {
      throw mapKnownError(err);
    }
  }
}

@Injectable()
export class UpdateUnidadeAtendimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    idRaw: string,
    dto: UpdateUnidadeAtendimentoDto,
  ): Promise<UnidadeAtendimentoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.unidades_atendimento.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw notFound();
    }
    const data: Prisma.unidades_atendimentoUpdateInput = {
      updated_at: new Date(),
    };
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ativa !== undefined) data.ativa = dto.ativa;
    try {
      const updated = await tx.unidades_atendimento.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as UnidadeAtRow);
    } catch (err: unknown) {
      throw mapKnownError(err);
    }
  }
}

@Injectable()
export class DeleteUnidadeAtendimentoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.unidades_atendimento.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) {
      throw notFound();
    }
    await tx.unidades_atendimento.update({
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
    code: 'UNIDADE_ATENDIMENTO_NOT_FOUND',
    message: 'Unidade de atendimento não encontrada.',
  });
}

function mapKnownError(err: unknown): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    return new ConflictException({
      code: 'UNIDADE_ATENDIMENTO_CODIGO_TAKEN',
      message: 'Já existe uma unidade de atendimento com este código.',
    });
  }
  return err;
}
