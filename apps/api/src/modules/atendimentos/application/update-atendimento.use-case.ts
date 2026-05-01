/**
 * `PATCH /v1/atendimentos/:uuid` — atualização de metadados leves
 * (CIDs, observação, motivo, guia/senha autorização). Não permite
 * trocar paciente/prestador/setor.
 *
 * RN-ATE-07: atendimento em estado pós-saída (`ALTA`/`CANCELADO`)
 * não deve receber novos dados clínicos. Aceita apenas atualização
 * de CIDs (pode haver reclassificação retroativa em até 24h).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { UpdateAtendimentoDto } from '../dto/update-atendimento.dto';
import type { AtendimentoResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentAtendimento } from './atendimento.presenter';

@Injectable()
export class UpdateAtendimentoUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateAtendimentoDto,
  ): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateAtendimentoUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoByUuid(uuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }

    if (atend.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'ATENDIMENTO_CANCELADO',
        message: 'Atendimento cancelado não pode ser atualizado.',
      });
    }

    await this.repo.updateAtendimentoLight(atend.id, {
      cidPrincipal: dto.cidPrincipal,
      cidsSecundarios: dto.cidsSecundarios,
      observacao: dto.observacao,
      motivoAtendimento: dto.motivoAtendimento,
      numeroGuiaOperadora: dto.numeroGuiaOperadora,
      senhaAutorizacao: dto.senhaAutorizacao,
      updatedBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.atualizado',
        campos: Object.keys(dto),
      },
      finalidade: 'atendimento.atualizado',
    });

    const updated = await this.repo.findAtendimentoByUuid(uuid);
    if (updated === null) {
      throw new Error('Atendimento atualizado não encontrado.');
    }
    return presentAtendimento(updated);
  }
}
