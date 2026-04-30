/**
 * Use cases: `POST /v1/especialidades` (admin) e
 * `PATCH /v1/especialidades/:codigoCbos` (admin).
 *
 * Catálogo é pequeno e relativamente estável; usamos `codigo_cbos` como
 * identificador no path até futura migração que adicione `uuid_externo`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type {
  CreateEspecialidadeDto,
  UpdateEspecialidadeDto,
} from '../dto/create-especialidade.dto';
import type { EspecialidadeListItem } from './list-especialidades.use-case';

@Injectable()
export class CreateEspecialidadeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    dto: CreateEspecialidadeDto,
  ): Promise<EspecialidadeListItem> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CreateEspecialidadeUseCase requires a request context.',
      );
    }
    const tx = this.prisma.tx();
    try {
      const row = await tx.especialidades.create({
        data: {
          tenant_id: ctx.tenantId,
          codigo_cbos: dto.codigoCbos,
          nome: dto.nome,
        },
      });
      return {
        uuid:
          (row as unknown as { uuid_externo?: string }).uuid_externo ??
          row.codigo_cbos,
        codigoCbos: row.codigo_cbos,
        nome: row.nome,
        ativo: row.ativo,
      };
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ESPECIALIDADE_DUPLICATE',
          message: 'Já existe uma especialidade com este código CBOS.',
        });
      }
      throw err;
    }
  }
}

@Injectable()
export class UpdateEspecialidadeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    codigoCbos: string,
    dto: UpdateEspecialidadeDto,
  ): Promise<EspecialidadeListItem> {
    const tx = this.prisma.tx();
    const existing = await tx.especialidades.findFirst({
      where: { codigo_cbos: codigoCbos },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException({
        code: 'ESPECIALIDADE_NOT_FOUND',
        message: 'Especialidade não encontrada.',
      });
    }

    const data: Prisma.especialidadesUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const row = await tx.especialidades.update({
      where: { id: existing.id },
      data,
    });
    return {
      uuid:
        (row as unknown as { uuid_externo?: string }).uuid_externo ??
        row.codigo_cbos,
      codigoCbos: row.codigo_cbos,
      nome: row.nome,
      ativo: row.ativo,
    };
  }
}
