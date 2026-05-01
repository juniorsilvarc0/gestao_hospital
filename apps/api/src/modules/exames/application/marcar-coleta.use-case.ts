/**
 * `POST /v1/solicitacoes-exame/:uuid/coleta` (RN-LAB-02).
 *
 * Marca a solicitação como COLETADA:
 *   - Só admite transição quando status atual ∈ {SOLICITADO, AUTORIZADO}.
 *   - Itens em estado pré-coleta acompanham a transição (UPDATE no
 *     repositório). Itens já em estado posterior (LAUDO_PARCIAL/FINAL,
 *     CANCELADO) preservam o status.
 *   - `data_realizacao` recebe `dto.dataColeta` ou `now()`.
 *
 * Audit `exame.coletado` (sem PHI).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { MarcarColetaDto } from '../dto/marcar-coleta.dto';
import type { SolicitacaoExameResponse } from '../dto/exame.response';
import type { SolicitacaoExameStatus } from '../dto/list-solicitacoes.dto';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentSolicitacao } from './solicitacao.presenter';

const STATUS_PERMITIDOS: SolicitacaoExameStatus[] = ['SOLICITADO', 'AUTORIZADO'];

@Injectable()
export class MarcarColetaUseCase {
  constructor(
    private readonly repo: ExamesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: MarcarColetaDto,
  ): Promise<SolicitacaoExameResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('MarcarColetaUseCase requires a request context.');
    }

    const locked = await this.repo.findSolicitacaoLockedByUuid(uuid);
    if (locked === null) {
      throw new NotFoundException({
        code: 'SOLICITACAO_EXAME_NOT_FOUND',
        message: 'Solicitação de exame não encontrada.',
      });
    }
    if (!STATUS_PERMITIDOS.includes(locked.status)) {
      throw new ConflictException({
        code: 'SOLICITACAO_STATUS_INVALIDO',
        message: `Coleta exige status SOLICITADO ou AUTORIZADO (atual: ${locked.status}).`,
      });
    }

    const dataColeta =
      dto.dataColeta !== undefined ? new Date(dto.dataColeta) : new Date();

    if (Number.isNaN(dataColeta.getTime())) {
      throw new ConflictException({
        code: 'SOLICITACAO_DATA_COLETA_INVALIDA',
        message: 'dataColeta inválida.',
      });
    }

    await this.repo.marcarColeta(locked.id, dataColeta);

    await this.auditoria.record({
      tabela: 'solicitacoes_exame',
      registroId: locked.id,
      operacao: 'U',
      diff: {
        evento: 'exame.coletado',
        data_coleta: dataColeta.toISOString(),
        ...(dto.observacao !== undefined ? { com_observacao: true } : {}),
      },
      finalidade: 'exame.coletado',
    });

    const updated = await this.repo.findSolicitacaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Solicitação não encontrada após coleta (RLS?).');
    }
    const itens = await this.repo.findItensBySolicitacaoId(updated.id);
    return presentSolicitacao(updated, itens);
  }
}
