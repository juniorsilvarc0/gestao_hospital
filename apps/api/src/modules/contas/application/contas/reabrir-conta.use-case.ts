/**
 * `POST /v1/contas/{uuid}/reabrir` — RN-FAT (reabertura).
 *
 * Permissão `contas:reabrir`. Status atual precisa ser FECHADA (não
 * FATURADA/PAGA — após geração TISS, reabrir exigiria estorno).
 *
 * Mantém os snapshots (RN-FAT-02 prevalece). Faturista pode revisar
 * itens e refazer fechar (que vai gerar novos snapshots se a condição
 * contratual mudar).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextContaStatus } from '../../domain/conta';
import type { ReabrirContaDto } from '../../dto/reabrir.dto';
import { ContasRepository } from '../../infrastructure/contas.repository';

export interface ReabrirContaResult {
  status: 'ABERTA';
}

@Injectable()
export class ReabrirContaUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    contaUuid: string,
    dto: ReabrirContaDto,
  ): Promise<ReabrirContaResult> {
    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }

    const target = nextContaStatus(conta.status, 'reabrir');
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'CONTA_TRANSICAO_INVALIDA',
        message: `Conta em status ${conta.status} não pode ser reaberta.`,
      });
    }

    await this.repo.updateContaStatus(conta.id, target);

    await this.auditoria.record({
      tabela: 'contas',
      registroId: conta.id,
      operacao: 'U',
      diff: {
        evento: 'conta.reaberta',
        status_anterior: conta.status,
        status_novo: target,
        motivo: dto.motivo,
      },
      finalidade: 'conta.reaberta',
    });

    return { status: 'ABERTA' };
  }
}
