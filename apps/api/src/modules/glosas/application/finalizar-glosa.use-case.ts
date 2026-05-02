/**
 * `POST /v1/glosas/{uuid}/finalizar` — RN-GLO-04.
 *
 * Status final: REVERTIDA_TOTAL/PARCIAL, ACATADA ou PERDA_DEFINITIVA.
 * Coerência valor_revertido validada por `validateValorRevertido`.
 *
 * Emite `glosa.recurso_resolvido` para Fase 9 reapurar repasse vinculado.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import {
  nextStatus,
  validateValorRevertido,
  type GlosaStatus,
} from '../domain/glosa';
import type { FinalizarGlosaDto } from '../dto/finalizar-glosa.dto';
import type { GlosaResponse } from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

function todayUtcIso(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class FinalizarGlosaUseCase {
  constructor(
    private readonly repo: GlosasRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    glosaUuid: string,
    dto: FinalizarGlosaDto,
  ): Promise<GlosaResponse> {
    const row = await this.repo.findGlosaByUuid(glosaUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'GLOSA_NOT_FOUND',
        message: 'Glosa não encontrada.',
      });
    }

    const target = nextStatus(row.status as GlosaStatus, 'finalizar', dto.status);
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'GLOSA_TRANSICAO_INVALIDA',
        message: `Glosa em status ${row.status} não pode ser finalizada como ${dto.status}.`,
      });
    }

    // Resolver valor_revertido coerente com status
    const valorGlosado = Number(row.valor_glosado);
    let valorRevertido: number;
    if (dto.status === 'REVERTIDA_TOTAL') {
      valorRevertido = valorGlosado;
    } else if (dto.status === 'ACATADA' || dto.status === 'PERDA_DEFINITIVA') {
      valorRevertido = 0;
    } else {
      // REVERTIDA_PARCIAL — exige valorRevertido fornecido
      if (dto.valorRevertido === undefined) {
        throw new UnprocessableEntityException({
          code: 'VALOR_REVERTIDO_OBRIGATORIO',
          message: 'REVERTIDA_PARCIAL exige valor_revertido.',
        });
      }
      valorRevertido = dto.valorRevertido;
    }

    const erro = validateValorRevertido(dto.status, valorGlosado, valorRevertido);
    if (erro !== null) {
      throw new UnprocessableEntityException({
        code: 'VALOR_REVERTIDO_INVALIDO',
        message: erro,
      });
    }

    const dataResposta = dto.dataRespostaRecurso ?? todayUtcIso();

    await this.repo.updateFinalizar({
      id: row.id,
      status: dto.status,
      valorRevertido: valorRevertido.toFixed(4),
      motivoResposta: dto.motivoResposta ?? null,
      dataRespostaRecurso: dataResposta,
    });

    await this.auditoria.record({
      tabela: 'glosas',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'glosa.recurso_resolvido',
        status_anterior: row.status,
        status_novo: dto.status,
        valor_revertido: valorRevertido.toFixed(4),
        data_resposta: dataResposta,
      },
      finalidade: 'glosa.recurso_resolvido',
    });

    this.events.emit('glosa.recurso_resolvido', {
      glosaUuid: row.uuid_externo,
      contaUuid: row.conta_uuid,
      status: dto.status,
      valorRevertido: valorRevertido.toFixed(4),
    });

    const updated = await this.repo.findGlosaByUuid(glosaUuid);
    if (updated === null) {
      throw new Error('Glosa após finalização não encontrada (RLS?).');
    }
    return presentGlosa(updated);
  }
}
