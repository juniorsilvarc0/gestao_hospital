/**
 * `DELETE /v1/kits-cirurgicos/{uuid}` — soft-delete (`deleted_at`).
 *
 * Cirurgias que já apontam para o kit mantêm a referência (FK ON DELETE
 * SET NULL não dispara aqui — fazemos soft-delete sem desvincular).
 * Logicamente o kit fica oculto da UI e dos novos agendamentos.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';

@Injectable()
export class DeleteKitUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DeleteKitUseCase requires a request context.');
    }
    const kit = await this.repo.findKitByUuid(uuid);
    if (kit === null) {
      throw new NotFoundException({
        code: 'KIT_NOT_FOUND',
        message: 'Kit cirúrgico não encontrado.',
      });
    }
    await this.repo.softDeleteKit(kit.id);
    await this.auditoria.record({
      tabela: 'kits_cirurgicos',
      registroId: kit.id,
      operacao: 'S',
      diff: {
        evento: 'kit.removido',
        codigo: kit.codigo,
      },
      finalidade: 'kit.removido',
    });
  }
}
