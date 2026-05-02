/**
 * `DELETE /v1/repasse/criterios/:uuid` — soft-delete.
 *
 * Não removemos fisicamente: critérios já referenciados por
 * `repasses_itens.criterio_id` precisam continuar acessíveis para
 * consulta histórica. Apenas marcamos `deleted_at`/`ativo=false` para
 * que apurações futuras o ignorem.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { RepasseRepository } from '../../infrastructure/repasse.repository';

@Injectable()
export class DeleteCriterioUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<{ ok: true }> {
    const existing = await this.repo.findCriterioByUuid(uuid);
    if (existing === null) {
      throw new NotFoundException({
        code: 'CRITERIO_NOT_FOUND',
        message: 'Critério não encontrado.',
      });
    }

    await this.repo.softDeleteCriterio(existing.id);

    await this.auditoria.record({
      tabela: 'criterios_repasse',
      registroId: existing.id,
      operacao: 'D',
      diff: { evento: 'criterio_repasse.removido' },
      finalidade: 'criterio_repasse.removido',
    });

    return { ok: true };
  }
}
