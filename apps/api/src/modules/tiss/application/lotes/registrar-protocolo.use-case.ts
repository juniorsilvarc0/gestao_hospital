/**
 * `POST /v1/tiss/lotes/{uuid}/protocolo` — registra protocolo da
 * operadora e move o lote `ENVIADO` → `PROCESSADO`.
 *
 * É operação separada do envio porque a operadora pode demorar
 * dias/horas para devolver o protocolo (algumas exigem polling).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { ProtocoloResponse } from '../../dto/responses';
import type { RegistrarProtocoloDto } from '../../dto/registrar-protocolo.dto';
import { TissRepository } from '../../infrastructure/tiss.repository';

@Injectable()
export class RegistrarProtocoloUseCase {
  constructor(
    private readonly repo: TissRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: RegistrarProtocoloDto,
  ): Promise<ProtocoloResponse> {
    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    if (lote.status !== 'ENVIADO') {
      throw new UnprocessableEntityException({
        code: 'LOTE_NAO_ENVIADO',
        message: `Apenas lotes ENVIADO aceitam protocolo (atual: ${lote.status}).`,
      });
    }

    await this.repo.updateLoteProtocolo({
      id: lote.id,
      protocolo: dto.protocolo,
    });

    await this.auditoria.record({
      tabela: 'lotes_tiss',
      registroId: lote.id,
      operacao: 'U',
      diff: {
        evento: 'lote_tiss.protocolo_registrado',
        protocolo: dto.protocolo,
      },
      finalidade: 'tiss.lote.protocolo',
    });

    const updated = await this.repo.findLoteByUuid(uuid);
    if (updated === null) {
      throw new Error('Lote não encontrado após protocolo.');
    }
    return {
      uuid: updated.uuid_externo,
      numeroLote: updated.numero_lote,
      protocoloOperadora: updated.protocolo_operadora,
      dataEnvio:
        updated.data_envio === null ? null : updated.data_envio.toISOString(),
      dataProcessamento:
        updated.data_processamento === null
          ? null
          : updated.data_processamento.toISOString(),
      status: updated.status,
    };
  }

  async getProtocolo(uuid: string): Promise<ProtocoloResponse> {
    const lote = await this.repo.findLoteByUuid(uuid);
    if (lote === null) {
      throw new NotFoundException({
        code: 'LOTE_NOT_FOUND',
        message: 'Lote não encontrado.',
      });
    }
    return {
      uuid: lote.uuid_externo,
      numeroLote: lote.numero_lote,
      protocoloOperadora: lote.protocolo_operadora,
      dataEnvio:
        lote.data_envio === null ? null : lote.data_envio.toISOString(),
      dataProcessamento:
        lote.data_processamento === null
          ? null
          : lote.data_processamento.toISOString(),
      status: lote.status,
    };
  }
}
