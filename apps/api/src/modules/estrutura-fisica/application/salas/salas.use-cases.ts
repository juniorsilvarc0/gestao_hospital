/**
 * Use cases de `salas_cirurgicas` — CRUD simples + mapa por setor.
 *
 * O ciclo de status (DISPONIVEL/OCUPADA/...) é provido pela Fase 7
 * (Centro Cirúrgico). Aqui apenas refletimos o que está no banco.
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
  CreateSalaCirurgicaDto,
  ListSalasQueryDto,
  SalaCirurgicaResponse,
  SalaMapaSetor,
  UpdateSalaCirurgicaDto,
} from '../../dto/sala-cirurgica.dto';
import { PaginatedResponse, paginate, toBigInt } from '../../dto/common';

interface SalaRow {
  id: bigint;
  codigo: string;
  nome: string;
  setor_id: bigint;
  tipo: string | null;
  status: string;
  ativa: boolean;
}

function toResponse(row: SalaRow): SalaCirurgicaResponse {
  return {
    id: row.id.toString(),
    codigo: row.codigo,
    nome: row.nome,
    setorId: row.setor_id.toString(),
    tipo: row.tipo,
    status: row.status,
    ativa: row.ativa,
  };
}

function requireTenantId(): bigint {
  const ctx = RequestContextStorage.get();
  if (ctx === undefined) {
    throw new Error('salas use case requires authenticated request context.');
  }
  return ctx.tenantId;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'SALA_NOT_FOUND',
    message: 'Sala cirúrgica não encontrada.',
  });
}

function parseId(raw: string): bigint {
  try {
    return toBigInt(raw);
  } catch {
    throw notFound();
  }
}

async function ensureSetor(
  tx: ReturnType<PrismaService['tx']>,
  id: bigint,
): Promise<{ id: bigint; nome: string }> {
  const found = await tx.setores.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, nome: true },
  });
  if (found === null) {
    throw new UnprocessableEntityException({
      code: 'SALA_SETOR_INVALIDO',
      message: 'Setor informado não existe.',
    });
  }
  return found;
}

@Injectable()
export class ListSalasUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    query: ListSalasQueryDto,
  ): Promise<PaginatedResponse<SalaCirurgicaResponse>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const tx = this.prisma.tx();
    const where: Prisma.salas_cirurgicasWhereInput = { deleted_at: null };
    if (query.search !== undefined && query.search.length > 0) {
      where.OR = [
        { codigo: { contains: query.search, mode: 'insensitive' } },
        { nome: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.setor_id !== undefined) where.setor_id = parseId(query.setor_id);
    if (query.status !== undefined) where.status = query.status;
    if (query.ativa !== undefined) where.ativa = query.ativa;

    const [total, items] = await Promise.all([
      tx.salas_cirurgicas.count({ where }),
      tx.salas_cirurgicas.findMany({
        where,
        orderBy: [{ setor_id: 'asc' }, { codigo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return paginate(items as SalaRow[], total, page, pageSize, toResponse);
  }
}

@Injectable()
export class GetSalaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<SalaCirurgicaResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const row = await tx.salas_cirurgicas.findFirst({
      where: { id, deleted_at: null },
    });
    if (row === null) throw notFound();
    return toResponse(row as SalaRow);
  }
}

@Injectable()
export class GetSalasMapaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<SalaMapaSetor[]> {
    const tx = this.prisma.tx();
    const setores = (await tx.setores.findMany({
      where: { deleted_at: null, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    })) as Array<{ id: bigint; nome: string }>;

    const salas = (await tx.salas_cirurgicas.findMany({
      where: { deleted_at: null },
      orderBy: [{ setor_id: 'asc' }, { codigo: 'asc' }],
    })) as SalaRow[];

    const porSetor = new Map<string, SalaRow[]>();
    for (const s of salas) {
      const key = s.setor_id.toString();
      const list = porSetor.get(key) ?? [];
      list.push(s);
      porSetor.set(key, list);
    }

    const out: SalaMapaSetor[] = [];
    for (const setor of setores) {
      const setorKey = setor.id.toString();
      const list = porSetor.get(setorKey) ?? [];
      if (list.length === 0) continue;
      const totais: Record<string, number> = {};
      for (const s of list) {
        totais[s.status] = (totais[s.status] ?? 0) + 1;
      }
      out.push({
        setorId: setorKey,
        setorNome: setor.nome,
        totais,
        salas: list.map(toResponse),
      });
    }
    return out;
  }
}

@Injectable()
export class CreateSalaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: CreateSalaCirurgicaDto): Promise<SalaCirurgicaResponse> {
    const tenantId = requireTenantId();
    const tx = this.prisma.tx();
    const setorId = parseId(dto.setorId);
    await ensureSetor(tx, setorId);
    try {
      const created = await tx.salas_cirurgicas.create({
        data: {
          tenant_id: tenantId,
          setor_id: setorId,
          codigo: dto.codigo,
          nome: dto.nome,
          tipo: dto.tipo ?? null,
          status: dto.status ?? 'DISPONIVEL',
          ativa: dto.ativa ?? true,
        },
      });
      return toResponse(created as SalaRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SALA_CODIGO_TAKEN',
          message: 'Já existe sala cirúrgica com este código.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class UpdateSalaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    idRaw: string,
    dto: UpdateSalaCirurgicaDto,
  ): Promise<SalaCirurgicaResponse> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.salas_cirurgicas.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();

    const data: Prisma.salas_cirurgicasUpdateInput = { updated_at: new Date() };
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.ativa !== undefined) data.ativa = dto.ativa;

    try {
      const updated = await tx.salas_cirurgicas.update({
        where: { id: existing.id },
        data,
      });
      return toResponse(updated as SalaRow);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SALA_CODIGO_TAKEN',
          message: 'Já existe sala cirúrgica com este código.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class DeleteSalaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(idRaw: string): Promise<void> {
    const id = parseId(idRaw);
    const tx = this.prisma.tx();
    const existing = await tx.salas_cirurgicas.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (existing === null) throw notFound();
    await tx.salas_cirurgicas.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), ativa: false },
    });
  }
}
