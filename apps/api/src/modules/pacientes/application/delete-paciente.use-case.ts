/**
 * Use case: `DELETE /v1/pacientes/{uuid}` — soft-delete (CLAUDE.md §2.1).
 *
 * Marca `deleted_at = now()` e `deleted_by = current_user`. Não apaga
 * fisicamente — RN-LGP-03/CFM 1.638 exige retenção. Vínculos com
 * convênios são também soft-deleted via `pacientes_convenios.deleted_at`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { PacientesRepository } from '../infrastructure/pacientes.repository';

@Injectable()
export class DeletePacienteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PacientesRepository,
  ) {}

  async execute(uuid: string): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DeletePacienteUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const id = await this.repo.findIdByUuid(uuid);
    if (id === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    await tx.$executeRaw`
      UPDATE pacientes
         SET deleted_at = now(),
             deleted_by = ${ctx.userId}::bigint,
             updated_at = now(),
             updated_by = ${ctx.userId}::bigint,
             versao     = versao + 1
       WHERE id = ${id}::bigint
         AND deleted_at IS NULL
    `;

    // Soft-delete dos vínculos ativos (não excluímos fisicamente —
    // histórico de cobertura é necessário em recurso de glosa, Fase 9).
    await tx.$executeRaw`
      UPDATE pacientes_convenios
         SET deleted_at = now(), ativo = FALSE
       WHERE paciente_id = ${id}::bigint
         AND deleted_at IS NULL
    `;
  }
}
