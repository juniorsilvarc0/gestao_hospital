/**
 * `DELETE /v1/pacotes/{uuid}` — soft-delete.
 *
 * Mantém referências históricas em contas já fechadas. Pacotes
 * inativos não retornam em listagens com `ativo=true`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';

@Injectable()
export class DeletePacoteUseCase {
  constructor(
    private readonly repo: PacotesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<void> {
    const row = await this.repo.findPacoteByUuid(uuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'PACOTE_NOT_FOUND',
        message: 'Pacote não encontrado.',
      });
    }

    await this.repo.softDeletePacote(row.id);

    await this.auditoria.record({
      tabela: 'pacotes',
      registroId: row.id,
      operacao: 'D',
      diff: {
        evento: 'pacote.removido',
        codigo: row.codigo,
      },
      finalidade: 'pacote.removido',
    });
  }
}
