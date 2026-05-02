/**
 * `PATCH /v1/repasse/criterios/:uuid` — atualização parcial.
 *
 * RN-REP-03: o critério vigente *snapshotado* num repasse já apurado é
 * imutável. Esta atualização não altera dados de repasses existentes;
 * apenas afeta apurações futuras.
 *
 * Se `regras` for enviado, revalidamos antes (mesmas regras de criação).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { validateCriterioRegras } from '../../domain/criterio-regras.schema';
import type { UpdateCriterioDto } from '../../dto/update-criterio.dto';
import type { CriterioResponse } from '../../dto/responses';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentCriterio } from './criterio.presenter';

@Injectable()
export class UpdateCriterioUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateCriterioDto,
  ): Promise<CriterioResponse> {
    const existing = await this.repo.findCriterioByUuid(uuid);
    if (existing === null) {
      throw new NotFoundException({
        code: 'CRITERIO_NOT_FOUND',
        message: 'Critério não encontrado.',
      });
    }

    // 1. valida regras se fornecidas
    let regrasParsed: Record<string, unknown> | undefined;
    if (dto.regras !== undefined) {
      const result = validateCriterioRegras(dto.regras);
      if (!result.ok) {
        throw new BadRequestException({
          code: 'CRITERIO_REGRAS_INVALIDAS',
          message: 'Regras do critério inválidas.',
          details: result.errors,
        });
      }
      regrasParsed = result.regras as unknown as Record<string, unknown>;
    }

    // 2. FKs por UUID (apenas quando enviado e não-null)
    let unidadeFaturamentoId: bigint | null | undefined;
    if (dto.unidadeFaturamentoUuid !== undefined) {
      if (dto.unidadeFaturamentoUuid === null) {
        unidadeFaturamentoId = null;
      } else {
        const id = await this.repo.findUnidadeFaturamentoIdByUuid(
          dto.unidadeFaturamentoUuid,
        );
        if (id === null) {
          throw new NotFoundException({
            code: 'UNIDADE_FATURAMENTO_NOT_FOUND',
            message: 'Unidade de faturamento não encontrada.',
          });
        }
        unidadeFaturamentoId = id;
      }
    }

    let unidadeAtendimentoId: bigint | null | undefined;
    if (dto.unidadeAtendimentoUuid !== undefined) {
      if (dto.unidadeAtendimentoUuid === null) {
        unidadeAtendimentoId = null;
      } else {
        const id = await this.repo.findUnidadeAtendimentoIdByUuid(
          dto.unidadeAtendimentoUuid,
        );
        if (id === null) {
          throw new NotFoundException({
            code: 'UNIDADE_ATENDIMENTO_NOT_FOUND',
            message: 'Unidade de atendimento não encontrada.',
          });
        }
        unidadeAtendimentoId = id;
      }
    }

    await this.repo.updateCriterio({
      id: existing.id,
      descricao: dto.descricao,
      vigenciaInicio: dto.vigenciaInicio,
      vigenciaFim: dto.vigenciaFim,
      unidadeFaturamentoId,
      unidadeAtendimentoId,
      tipoBaseCalculo: dto.tipoBaseCalculo,
      momentoRepasse: dto.momentoRepasse,
      diaFechamento: dto.diaFechamento,
      prazoDias: dto.prazoDias,
      prioridade: dto.prioridade,
      ativo: dto.ativo,
      regras: regrasParsed,
    });

    await this.auditoria.record({
      tabela: 'criterios_repasse',
      registroId: existing.id,
      operacao: 'U',
      diff: {
        evento: 'criterio_repasse.atualizado',
        campos_alterados: Object.keys(dto),
      },
      finalidade: 'criterio_repasse.atualizado',
    });

    const updated = await this.repo.findCriterioByUuid(uuid);
    if (updated === null) {
      throw new Error('Critério atualizado não encontrado (RLS?).');
    }
    return presentCriterio(updated);
  }
}
