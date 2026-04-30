/**
 * `GET /v1/agendas/recursos/:uuid` — detalhe completo do recurso.
 * `DELETE /v1/agendas/recursos/:uuid` — soft-delete (CLAUDE.md §2.1).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import type { RecursoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentRecurso } from './recurso.presenter';

@Injectable()
export class GetRecursoUseCase {
  constructor(private readonly repo: AgendamentoRepository) {}

  async execute(uuid: string): Promise<RecursoResponse> {
    const row = await this.repo.findRecursoByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }
    return presentRecurso(row);
  }
}

@Injectable()
export class DeleteRecursoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
  ) {}

  async execute(uuid: string): Promise<void> {
    const id = await this.repo.findRecursoIdByUuid(uuid);
    if (id === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE agendas_recursos
         SET deleted_at = now(),
             updated_at = now(),
             ativo = FALSE
       WHERE id = ${id}::bigint AND deleted_at IS NULL
    `;
  }
}
