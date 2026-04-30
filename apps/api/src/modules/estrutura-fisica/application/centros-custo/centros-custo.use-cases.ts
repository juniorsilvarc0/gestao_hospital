/**
 * Use cases de `centros_custo` — CRUD + hierarquia (parent_id).
 *
 * Validação: ao criar/atualizar com `parentId`, garantimos:
 *   - Pai existe no mesmo tenant.
 *   - Pai não é o próprio nó (auto-referência).
 *   - Não cria ciclo (subir pelos ancestrais até a raiz; o id atual
 *     não pode aparecer no caminho).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  CentroCustoResponse,
  CentroCustoTreeNode,
  CreateCentroCustoDto,
  ListCentrosCustoQueryDto,
  UpdateCentroCustoDto,
} from '../../dto/centro-custo.dto';
import { PaginatedResponse, paginate, toBigInt } from '../../dto/common';

interface CentroCustoRow {
  id: bigint;
  codigo: string;
  nome: string;
  parent_id: bigint | null;
  ativo: boolean;
}

function toResponse(row: CentroCustoRow): CentroCustoResponse {
  return {
    id: row.id.toString(),
    codigo: row.codigo,
    nome: row.nome,
    parentId: row.parent_id ? row.parent_id.toString() : null,
    ativo: row.ativo,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error(
      'centros-custo use case requires authenticated request context.',
    );
  }
  return ctx.tenantId;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'CENTRO_CUSTO_NOT_FOUND',
    message: 'Centro de custo não encontrado.',
  });
}

function parseId(raw: string): bigint {
  try {
    return toBigInt(raw);
  } catch {
    throw notFound();
  }
}

@Injectable()
export class ListCentrosCustoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListCentrosCustoQueryDto,
  ): Promise<PaginatedResponse<CentroCustoResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const tx = this.prisma.tx();
    const where: Prisma.centros_custoWhereInput = { deleted_at: null };
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { codigo: { contains: query.search, mode: 'insensitive' } },
        { nome: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.ativo !== undefined) {
      where.ativo = query.ativo;
    }
    if (query.parent !== undefined) {
      if (query.parent === 'null' || query.parent === '') {
        where.parent_id = null;
      } else {
        where.parent_id = parseId(query.parent);
      }
    }

    const [total, items] = await Promise.all([
      tx.centros_custo.count({ where }),
      tx.centros_custo.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as CentroCustoRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetCentroCustoTreeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<CentroCustoTreeNode[]> {
    const tx = this.prisma.tx();
    const rows = (await tx.centros_custo.findMany({
      where: { deleted_at: null },
      orderBy: { codigo: 'asc' },
    })) as CentroCustoRow[];

    // Indexa por id e popula `children`.
    const map = new Map<string, CentroCustoTreeNode>();
    for (const r of rows) {
      const node: CentroCustoTreeNode = { ...toResponse(r), children: [] };
      map.set(node.id, node);
    }
    const roots: CentroCustoTreeNode[] = [];
    for (const node of map.values()) {
      if (node.parentId === null) {
        roots.push(node);
      } else {
        const parent = map.get(node.parentId);
        if (parent !== undefined) {
          parent.children.push(node);
        } else {
          // Pai foi deletado mas filho permaneceu — exposto como raiz.
          roots.push(node);
        }
      }
    }
    return roots;
  }
}

@Injectable()
export class GetCentroCustoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<CentroCustoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.centros_custo.findFirst({
      where: { id, deleted_at: null },
    });
    if (row === null) throw notFound();
    return toResponse(row as CentroCustoRow);
  }
}

@Injectable()
export class CreateCentroCustoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateCentroCustoDto): Promise<CentroCustoResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();
    let parentId: bigint | null = null;
    if (dto.parentId !== undefined && dto.parentId !== null) {
      parentId = parseId(dto.parentId);
      const parent = await tx.centros_custo.findFirst({
        where: { id: parentId, deleted_at: null },
        select: { id: true },
      });
      if (parent === null) {
        throw new UnprocessableEntityException({
          code: 'CENTRO_CUSTO_PARENT_NOT_FOUND',
          message: 'Centro de custo pai não encontrado.',
        });
      }
    }
    try {
      const created = await tx.centros_custo.create({
        data: {
          tenant_id: tenantId,
          codigo: dto.codigo,
          nome: dto.nome,
          parent_id: parentId,
          ativo: dto.ativo ?? true,
        },
      });
      return toResponse(created as CentroCustoRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CENTRO_CUSTO_CODIGO_TAKEN',
          message: 'Já existe centro de custo com este código.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class UpdateCentroCustoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    idRaw: string,
    dto: UpdateCentroCustoDto,
  ): Promise<CentroCustoResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = (await tx.centros_custo.findFirst({
      where: { id, deleted_at: null },
    })) as CentroCustoRow | null;
    if (existing === null) throw notFound();

    const data: Prisma.centros_custoUpdateInput = {
      updated_at: new Date(),
    };
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.parentId !== undefined) {
      if (dto.parentId === null || dto.parentId === '') {
        data.centros_custo = { disconnect: true };
      } else {
        const parentId = parseId(dto.parentId);
        if (parentId === id) {
          throw new UnprocessableEntityException({
            code: 'CENTRO_CUSTO_PARENT_SELF',
            message: 'Centro de custo não pode ser pai de si mesmo.',
          });
        }
        await assertNoCycle(tx, id, parentId);
        data.centros_custo = { connect: { id: parentId } };
      }
    }

    try {
      const updated = await tx.centros_custo.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as CentroCustoRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CENTRO_CUSTO_CODIGO_TAKEN',
          message: 'Já existe centro de custo com este código.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class DeleteCentroCustoUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.centros_custo.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();

    // Não deixa apagar pai que ainda tem filhos vivos.
    const filhos = await tx.centros_custo.count({
      where: { parent_id: id, deleted_at: null },
    });
    if (filhos > 0) {
      throw new ConflictException({
        code: 'CENTRO_CUSTO_TEM_FILHOS',
        message:
          'Centro de custo possui sub-centros ativos. Remova-os antes.',
      });
    }
    await tx.centros_custo.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), ativo: false },
    });
  }
}

/**
 * Sobe pelos ancestrais a partir de `parentId`. Se o `id` aparecer,
 * estamos diante de um ciclo. Limita a profundidade defensivamente.
 */
async function assertNoCycle(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
  parentId: bigint,
): Promise<void> {
  let current: bigint | null = parentId;
  for (let depth = 0; depth < 50 && current !== null; depth += 1) {
    if (current === id) {
      throw new UnprocessableEntityException({
        code: 'CENTRO_CUSTO_CYCLE',
        message: 'Mudança criaria ciclo na hierarquia de centros de custo.',
      });
    }
    const ancestor: { parent_id: bigint | null } | null =
      await tx.centros_custo.findFirst({
        where: { id: current, deleted_at: null },
        select: { parent_id: true },
      });
    if (ancestor === null) {
      return;
    }
    current = ancestor.parent_id;
  }
}
