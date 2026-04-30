/**
 * `PATCH /v1/agendas/recursos/:uuid` — atualização parcial.
 * Apenas os campos operacionais são editáveis (intervalo, encaixe,
 * ativo, observação). Trocar referência (prestador/sala) seria criar
 * outro recurso — bloqueado intencionalmente.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { UpdateRecursoDto } from '../../dto/create-recurso.dto';
import type { RecursoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentRecurso } from './recurso.presenter';

@Injectable()
export class UpdateRecursoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
  ) {}

  async execute(uuid: string, dto: UpdateRecursoDto): Promise<RecursoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateRecursoUseCase requires a request context.');
    }

    const id = await this.repo.findRecursoIdByUuid(uuid);
    if (id === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }

    const sets: Prisma.Sql[] = [];
    if (dto.intervaloMinutos !== undefined) {
      sets.push(Prisma.sql`intervalo_minutos = ${dto.intervaloMinutos}`);
    }
    if (dto.permiteEncaixe !== undefined) {
      sets.push(Prisma.sql`permite_encaixe = ${dto.permiteEncaixe}`);
    }
    if (dto.encaixeMaxDia !== undefined) {
      sets.push(Prisma.sql`encaixe_max_dia = ${dto.encaixeMaxDia}`);
    }
    if (dto.ativo !== undefined) {
      sets.push(Prisma.sql`ativo = ${dto.ativo}`);
    }
    if (dto.observacao !== undefined) {
      sets.push(Prisma.sql`observacao = ${dto.observacao}`);
    }

    if (sets.length > 0) {
      sets.push(Prisma.sql`updated_at = now()`);
      const tx = this.prisma.tx();
      await tx.$executeRaw(
        Prisma.sql`UPDATE agendas_recursos SET ${Prisma.join(sets, ', ')}
                    WHERE id = ${id}::bigint AND deleted_at IS NULL`,
      );
    }

    const updated = await this.repo.findRecursoByUuid(uuid);
    if (updated === null) {
      throw new NotFoundException({ code: 'RECURSO_NOT_FOUND' });
    }
    return presentRecurso(updated);
  }
}
