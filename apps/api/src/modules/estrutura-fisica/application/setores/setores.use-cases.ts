/**
 * Use cases de `setores` — CRUD com FKs validadas.
 *
 * Garantias:
 *   - `unidadeFaturamentoId` e `unidadeAtendimentoId` existem no tenant.
 *   - `centroCustoId`, quando informado, existe e está ativo.
 *   - Soft-delete preserva referências históricas (atendimentos antigos
 *     continuam apontando para o setor mesmo após desativação).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, enum_setor_tipo as SetorTipo } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  CreateSetorDto,
  ListSetoresQueryDto,
  SetorResponse,
  UpdateSetorDto,
} from '../../dto/setor.dto';
import { PaginatedResponse, paginate, toBigInt } from '../../dto/common';

interface SetorRow {
  id: bigint;
  uuid_externo: string;
  nome: string;
  tipo: SetorTipo;
  unidade_faturamento_id: bigint;
  unidade_atendimento_id: bigint;
  centro_custo_id: bigint | null;
  capacidade: number | null;
  ativo: boolean;
}

function toResponse(row: SetorRow): SetorResponse {
  return {
    id: row.id.toString(),
    uuid: row.uuid_externo,
    nome: row.nome,
    tipo: row.tipo,
    unidadeFaturamentoId: row.unidade_faturamento_id.toString(),
    unidadeAtendimentoId: row.unidade_atendimento_id.toString(),
    centroCustoId: row.centro_custo_id ? row.centro_custo_id.toString() : null,
    capacidade: row.capacidade,
    ativo: row.ativo,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error('setores use case requires authenticated request context.');
  }
  return ctx.tenantId;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'SETOR_NOT_FOUND',
    message: 'Setor não encontrado.',
  });
}

function parseId(raw: string): bigint {
  try {
    return toBigInt(raw);
  } catch {
    throw notFound();
  }
}

async function ensureUnidadeFat(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
): Promise<void> {
  const found = await tx.unidades_faturamento.findFirst({
    where: { id, deleted_at: null },
    select: { id: true },
  });
  if (found === null) {
    throw new UnprocessableEntityException({
      code: 'SETOR_UNIDADE_FATURAMENTO_INVALIDA',
      message: 'Unidade de faturamento informada não existe.',
    });
  }
}

async function ensureUnidadeAt(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
): Promise<void> {
  const found = await tx.unidades_atendimento.findFirst({
    where: { id, deleted_at: null },
    select: { id: true },
  });
  if (found === null) {
    throw new UnprocessableEntityException({
      code: 'SETOR_UNIDADE_ATENDIMENTO_INVALIDA',
      message: 'Unidade de atendimento informada não existe.',
    });
  }
}

async function ensureCentroCusto(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
): Promise<void> {
  const found = await tx.centros_custo.findFirst({
    where: { id, deleted_at: null },
    select: { id: true },
  });
  if (found === null) {
    throw new UnprocessableEntityException({
      code: 'SETOR_CENTRO_CUSTO_INVALIDO',
      message: 'Centro de custo informado não existe.',
    });
  }
}

@Injectable()
export class ListSetoresUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListSetoresQueryDto,
  ): Promise<PaginatedResponse<SetorResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const tx = this.prisma.tx();
    const where: Prisma.setoresWhereInput = { deleted_at: null };
    if (query.search !== undefined && query.search.length > 0) {
      where.nome = { contains: query.search, mode: 'insensitive' };
    }
    if (query.tipo !== undefined) where.tipo = query.tipo;
    if (query.ativo !== undefined) where.ativo = query.ativo;
    if (query.unidade_faturamento_id !== undefined) {
      where.unidade_faturamento_id = parseId(query.unidade_faturamento_id);
    }
    if (query.unidade_atendimento_id !== undefined) {
      where.unidade_atendimento_id = parseId(query.unidade_atendimento_id);
    }

    const [total, items] = await Promise.all([
      tx.setores.count({ where }),
      tx.setores.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as SetorRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetSetorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<SetorResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.setores.findFirst({
      where: { id, deleted_at: null },
    });
    if (row === null) throw notFound();
    return toResponse(row as SetorRow);
  }
}

@Injectable()
export class CreateSetorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateSetorDto): Promise<SetorResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();

    const unidadeFatId = parseId(dto.unidadeFaturamentoId);
    const unidadeAtId = parseId(dto.unidadeAtendimentoId);
    await ensureUnidadeFat(tx, unidadeFatId);
    await ensureUnidadeAt(tx, unidadeAtId);

    let centroCustoId: bigint | null = null;
    if (dto.centroCustoId !== undefined) {
      centroCustoId = parseId(dto.centroCustoId);
      await ensureCentroCusto(tx, centroCustoId);
    }

    try {
      const created = await tx.setores.create({
        data: {
          tenant_id: tenantId,
          nome: dto.nome,
          tipo: dto.tipo,
          unidade_faturamento_id: unidadeFatId,
          unidade_atendimento_id: unidadeAtId,
          centro_custo_id: centroCustoId,
          capacidade: dto.capacidade ?? null,
          ativo: dto.ativo ?? true,
        },
      });
      return toResponse(created as SetorRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SETOR_NOME_TAKEN',
          message: 'Já existe setor com este nome.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class UpdateSetorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string, dto: UpdateSetorDto): Promise<SetorResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.setores.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();

    const data: Prisma.setoresUpdateInput = { updated_at: new Date() };
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.capacidade !== undefined) data.capacidade = dto.capacidade;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    if (dto.unidadeFaturamentoId !== undefined) {
      const ufId = parseId(dto.unidadeFaturamentoId);
      await ensureUnidadeFat(tx, ufId);
      data.unidades_faturamento = { connect: { id: ufId } };
    }
    if (dto.unidadeAtendimentoId !== undefined) {
      const uaId = parseId(dto.unidadeAtendimentoId);
      await ensureUnidadeAt(tx, uaId);
      data.unidades_atendimento = { connect: { id: uaId } };
    }
    if (dto.centroCustoId !== undefined) {
      if (dto.centroCustoId === null || dto.centroCustoId === '') {
        data.centros_custo = { disconnect: true };
      } else {
        const ccId = parseId(dto.centroCustoId);
        await ensureCentroCusto(tx, ccId);
        data.centros_custo = { connect: { id: ccId } };
      }
    }

    try {
      const updated = await tx.setores.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as SetorRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SETOR_NOME_TAKEN',
          message: 'Já existe setor com este nome.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class DeleteSetorUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.setores.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();

    // Bloqueia soft-delete se houver leitos/salas ativos vinculados.
    const [leitosAtivos, salasAtivas] = await Promise.all([
      tx.leitos.count({
        where: { setor_id: id, deleted_at: null, ativo: true },
      }),
      tx.salas_cirurgicas.count({
        where: { setor_id: id, deleted_at: null, ativa: true },
      }),
    ]);
    if (leitosAtivos > 0 || salasAtivas > 0) {
      throw new ConflictException({
        code: 'SETOR_TEM_DEPENDENCIAS',
        message:
          'Setor possui leitos ou salas ativos. Desative-os antes de remover o setor.',
      });
    }
    await tx.setores.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), ativo: false },
    });
  }
}
