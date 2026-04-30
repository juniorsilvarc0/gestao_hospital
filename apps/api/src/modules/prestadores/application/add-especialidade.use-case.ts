/**
 * Use case: `POST /v1/prestadores/:uuid/especialidades` — vincula
 * especialidade ao prestador (M:N).
 *
 * Regras:
 *   - Se `principal=true`, desmarca a anterior do mesmo prestador (apenas
 *     uma especialidade principal por prestador).
 *   - Se já existe vínculo (mesma especialidade), atualiza `principal`/`rqe`.
 *   - Catálogo `especialidades` ainda não tem `uuid_externo` no DB; se o
 *     identificador recebido não for UUID, tratamos como `codigo_cbos`.
 *   - Auditoria APP-LEVEL: emite `prestador.especialidade.added` (porque
 *     o tg_audit não cobre a tabela join sem tenant_id).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { AddEspecialidadeDto } from '../dto/add-especialidade.dto';
import type { PrestadorResponse } from '../dto/prestador.response';
import { GetPrestadorUseCase } from './get-prestador.use-case';

@Injectable()
export class AddEspecialidadeUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly getPrestador: GetPrestadorUseCase,
  ) {}

  async execute(
    prestadorUuid: string,
    dto: AddEspecialidadeDto,
  ): Promise<PrestadorResponse> {
    const tx = this.prisma.tx();

    const prestador = await tx.prestadores.findFirst({
      where: { uuid_externo: prestadorUuid, deleted_at: null },
      select: { id: true },
    });
    if (prestador === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }

    // Resolução de `especialidades` por uuid_externo (se existir) ou
    // por `codigo_cbos`. RLS já filtra por tenant.
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(dto.especialidadeUuid);
    const especialidade = await tx.especialidades.findFirst({
      where: isUuid
        ? // @ts-expect-error — coluna ainda pode não existir no schema atual
          { uuid_externo: dto.especialidadeUuid, ativo: true }
        : { codigo_cbos: dto.especialidadeUuid, ativo: true },
      select: { id: true, codigo_cbos: true },
    });
    if (especialidade === null) {
      throw new NotFoundException({
        code: 'ESPECIALIDADE_NOT_FOUND',
        message: 'Especialidade não encontrada (catálogo CBOS).',
      });
    }

    if (dto.principal === true) {
      // Desmarca outras "principais" do mesmo prestador.
      await tx.prestadores_especialidades.updateMany({
        where: { prestador_id: prestador.id, principal: true },
        data: { principal: false },
      });
    }

    try {
      await tx.prestadores_especialidades.upsert({
        where: {
          prestador_id_especialidade_id: {
            prestador_id: prestador.id,
            especialidade_id: especialidade.id,
          },
        },
        create: {
          prestador_id: prestador.id,
          especialidade_id: especialidade.id,
          principal: dto.principal ?? false,
          rqe: dto.rqe ?? null,
        },
        update: {
          principal: dto.principal ?? false,
          rqe: dto.rqe ?? null,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ESPECIALIDADE_DUPLICATE',
          message: 'Vínculo já existe para esta especialidade.',
        });
      }
      throw err;
    }

    await this.auditoria.record({
      tabela: 'prestadores_especialidades',
      registroId: prestador.id,
      operacao: 'I',
      diff: {
        evento: 'prestador.especialidade.added',
        prestador_id: prestador.id.toString(),
        especialidade_id: especialidade.id.toString(),
        codigo_cbos: especialidade.codigo_cbos,
        principal: dto.principal ?? false,
        rqe: dto.rqe ?? null,
      },
      finalidade: 'cadastro.prestador.especialidade',
    });

    return this.getPrestador.execute(prestadorUuid);
  }
}
