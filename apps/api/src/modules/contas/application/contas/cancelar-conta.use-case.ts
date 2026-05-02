/**
 * `POST /v1/contas/{uuid}/cancelar` — cancelamento com motivo.
 *
 * ABERTA / EM_ELABORACAO → CANCELADA. Status terminal — não admite
 * reabertura (uma nova conta precisa ser aberta para o atendimento se
 * isso for necessário).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextContaStatus } from '../../domain/conta';
import type { CancelarContaDto } from '../../dto/cancelar-conta.dto';
import { ContasRepository } from '../../infrastructure/contas.repository';

export interface CancelarContaResult {
  status: 'CANCELADA';
}

@Injectable()
export class CancelarContaUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    contaUuid: string,
    dto: CancelarContaDto,
  ): Promise<CancelarContaResult> {
    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }

    const target = nextContaStatus(conta.status, 'cancelar');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CONTA_TRANSICAO_INVALIDA',
        message: `Conta em status ${conta.status} não pode ser cancelada.`,
      });
    }

    await this.repo.updateContaStatus(conta.id, target);

    await this.auditoria.record({
      tabela: 'contas',
      registroId: conta.id,
      operacao: 'U',
      diff: {
        evento: 'conta.cancelada',
        status_anterior: conta.status,
        status_novo: target,
        motivo: dto.motivo,
      },
      finalidade: 'conta.cancelada',
    });

    return { status: 'CANCELADA' };
  }
}
