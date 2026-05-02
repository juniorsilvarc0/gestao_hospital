/**
 * `DELETE /v1/contas/{uuid}/itens/{itemUuid}` — soft-delete de item.
 *
 * Conta precisa estar ABERTA ou EM_ELABORACAO. A trigger
 * `tg_atualiza_totais_conta` recalcula valores no banco após o
 * `deleted_at` aplicado.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { ContasRepository } from '../../infrastructure/contas.repository';

@Injectable()
export class RemoverItemUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(contaUuid: string, itemUuid: string): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RemoverItemUseCase requires request context.');
    }

    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.status !== 'ABERTA' && conta.status !== 'EM_ELABORACAO') {
      throw new UnprocessableEntityException({
        code: 'CONTA_STATUS_INVALIDO',
        message: `Remoção exige status ABERTA ou EM_ELABORACAO; atual: ${conta.status}.`,
      });
    }

    const item = await this.repo.findItemByUuid(itemUuid);
    if (item === null || item.contaId !== conta.id) {
      throw new NotFoundException({
        code: 'CONTA_ITEM_NOT_FOUND',
        message: 'Item não encontrado nesta conta.',
      });
    }

    await this.repo.softDeleteContaItem(item.id, ctx.userId);

    await this.auditoria.record({
      tabela: 'contas_itens',
      registroId: item.id,
      operacao: 'D',
      diff: {
        evento: 'contas.item_removido',
        conta_id: conta.id.toString(),
        valor_total_removido: item.valorTotal,
        grupo_gasto: item.grupoGasto,
      },
      finalidade: 'contas.item_removido',
    });
  }
}
