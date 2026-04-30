/**
 * Use case: `POST /v1/pacientes/{uuid}/convenios`.
 *
 * Vincula um convênio (e opcionalmente plano) ao paciente. Idempotência:
 * se já existir vínculo (mesmo `convenio_id` + `numero_carteirinha`)
 * não-deletado, retorna 409 (RN-CAD-04 — uma carteirinha por convênio).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { PacientesRepository } from '../infrastructure/pacientes.repository';
import type { LinkConvenioDto } from '../dto/link-convenio.dto';

@Injectable()
export class LinkConvenioUseCase {
  constructor(private readonly repo: PacientesRepository) {}

  async execute(
    pacienteUuid: string,
    dto: LinkConvenioDto,
  ): Promise<{ uuid: string }> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('LinkConvenioUseCase requires a request context.');
    }

    const pacienteId = await this.repo.findIdByUuid(pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const convenioId = await this.repo.findConvenioIdByUuid(dto.convenioUuid);
    if (convenioId === null) {
      throw new UnprocessableEntityException({
        code: 'CONVENIO_NOT_FOUND',
        message: 'Convênio não encontrado.',
      });
    }

    let planoId: bigint | null = null;
    if (dto.planoUuid !== undefined) {
      planoId = await this.repo.findPlanoIdByUuid(dto.planoUuid);
      if (planoId === null) {
        throw new UnprocessableEntityException({
          code: 'PLANO_NOT_FOUND',
          message: 'Plano não encontrado.',
        });
      }
    }

    try {
      const created = await this.repo.createVinculo({
        tenantId: ctx.tenantId,
        pacienteId,
        convenioId,
        planoId,
        numeroCarteirinha: dto.numeroCarteirinha,
        validade: dto.validade ?? null,
        titular: dto.titular ?? true,
        parentescoTitular: dto.parentescoTitular ?? null,
        prioridade: dto.prioridade ?? 1,
      });
      return { uuid: created.uuidExterno };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes('uq_pac_conv_carteirinha')
      ) {
        throw new ConflictException({
          code: 'CARTEIRINHA_TAKEN',
          message:
            'Já existe vínculo com este convênio e número de carteirinha.',
        });
      }
      throw err;
    }
  }
}
