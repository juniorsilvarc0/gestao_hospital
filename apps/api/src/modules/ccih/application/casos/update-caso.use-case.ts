/**
 * `PATCH /v1/ccih/casos/{uuid}` — atualiza dados clínicos do caso.
 *
 * Casos terminais (ENCERRADO/CANCELADO) são imutáveis aqui.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  normalizeAntibiograma,
  validateAntibiograma,
} from '../../domain/antibiograma';
import { CCIH_TERMINAIS, type CcihCasoStatus } from '../../domain/caso';
import type { UpdateCasoCcihDto } from '../../dto/update-caso.dto';
import type { CasoCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class UpdateCasoUseCase {
  constructor(
    private readonly repo: CcihRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateCasoCcihDto,
  ): Promise<CasoCcihResponse> {
    const caso = await this.repo.findCasoByUuid(uuid);
    if (caso === null) {
      throw new NotFoundException({
        code: 'CCIH_CASO_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }
    if (CCIH_TERMINAIS.has(caso.status as CcihCasoStatus)) {
      throw new UnprocessableEntityException({
        code: 'CCIH_CASO_TERMINAL',
        message: `Caso em status ${caso.status} não pode mais ser editado.`,
      });
    }

    if (dto.resistencia !== undefined) {
      const erro = validateAntibiograma(dto.resistencia);
      if (erro !== null) {
        throw new UnprocessableEntityException({
          code: 'ANTIBIOGRAMA_INVALIDO',
          message: erro,
        });
      }
    }

    let leitoId: bigint | null | undefined;
    let setLeitoNull = false;
    if (dto.leitoUuid === null) {
      setLeitoNull = true;
    } else if (dto.leitoUuid !== undefined) {
      const id = await this.repo.findLeitoIdByUuid(dto.leitoUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'LEITO_NOT_FOUND',
          message: 'Leito não encontrado.',
        });
      }
      leitoId = id;
    }

    const resistencia =
      dto.resistencia === undefined
        ? undefined
        : normalizeAntibiograma(dto.resistencia);

    await this.repo.updateCaso({
      id: caso.id,
      leitoId,
      setLeitoNull,
      topografia: dto.topografia,
      cid: dto.cid,
      microorganismo: dto.microorganismo,
      culturaOrigem: dto.culturaOrigem,
      resistencia,
      origemInfeccao: dto.origemInfeccao,
      observacao: dto.observacao,
    });

    await this.auditoria.record({
      tabela: 'ccih_casos',
      registroId: caso.id,
      operacao: 'U',
      diff: {
        evento: 'ccih.caso_atualizado',
        campos_alterados: Object.keys(dto),
      },
      finalidade: 'ccih.caso_atualizado',
    });

    const updated = await this.repo.findCasoByUuid(uuid);
    if (updated === null) {
      throw new Error('Caso CCIH pós-atualização não encontrado (RLS?).');
    }
    return presentCaso(updated);
  }
}
