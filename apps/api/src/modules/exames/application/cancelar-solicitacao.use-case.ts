/**
 * `DELETE /v1/solicitacoes-exame/:uuid` — cancelamento da solicitação.
 *
 * Regras:
 *   - Estados terminais NÃO podem cancelar:
 *       LAUDO_FINAL — laudo já liberado, paciente recebeu (RN-LAB-04
 *       imutabilidade).
 *       CANCELADO  — idempotente; lançamos 409 explícito.
 *   - Demais estados: marca solicitação como CANCELADA + propaga em
 *     itens não-finalizados.
 *   - Soft-cancel: gravamos motivo na coluna `observacao` (concatenado);
 *     a tabela `solicitacoes_exame` não tem `deleted_at` no schema, e o
 *     CHECK do enum status já cobre o estado terminal.
 *
 * Audit `exame.cancelado`.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CancelarSolicitacaoDto } from '../dto/marcar-coleta.dto';
import { ExamesRepository } from '../infrastructure/exames.repository';

@Injectable()
export class CancelarSolicitacaoUseCase {
  constructor(
    private readonly repo: ExamesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: CancelarSolicitacaoDto): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CancelarSolicitacaoUseCase requires a request context.');
    }
    const motivo = dto.motivo.trim();
    if (motivo.length === 0) {
      throw new BadRequestException({
        code: 'SOLICITACAO_MOTIVO_REQUIRED',
        message: 'motivo é obrigatório para cancelar.',
      });
    }

    const locked = await this.repo.findSolicitacaoLockedByUuid(uuid);
    if (locked === null) {
      throw new NotFoundException({
        code: 'SOLICITACAO_EXAME_NOT_FOUND',
        message: 'Solicitação de exame não encontrada.',
      });
    }
    if (locked.status === 'LAUDO_FINAL' || locked.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'SOLICITACAO_STATUS_INVALIDO',
        message: `Não é possível cancelar solicitação em status ${locked.status}.`,
      });
    }

    await this.repo.cancelarSolicitacao(locked.id, motivo);

    await this.auditoria.record({
      tabela: 'solicitacoes_exame',
      registroId: locked.id,
      operacao: 'U',
      diff: {
        evento: 'exame.cancelado',
        motivo_resumo: motivo.slice(0, 120),
        status_anterior: locked.status,
      },
      finalidade: 'exame.cancelado',
    });
  }
}
