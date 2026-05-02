/**
 * `POST /v1/repasse/criterios` — cria critério (RN-REP-02/03).
 *
 * Pipeline:
 *   1. Validação semântica do JSONB `regras` (`validateCriterioRegras`).
 *      Em erro: 400 com lista de mensagens em PT-BR.
 *   2. Resolução de FKs por UUID (unidades).
 *   3. INSERT.
 *   4. Audit log `criterio_repasse.criado`.
 *   5. Devolve `CriterioResponse`.
 *
 * Idempotência: não há (criar critério é operação rara/manual e o usuário
 * pode ter mais de um vigente). Conflitos por chaves naturais não são
 * impostos no DB — autorização editorial fica a cargo da UI.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { validateCriterioRegras } from '../../domain/criterio-regras.schema';
import type { CreateCriterioDto } from '../../dto/create-criterio.dto';
import type { CriterioResponse } from '../../dto/responses';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentCriterio } from './criterio.presenter';

@Injectable()
export class CreateCriterioUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateCriterioDto): Promise<CriterioResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateCriterioUseCase requires request context.');
    }

    // 1. validação JSON
    const result = validateCriterioRegras(dto.regras);
    if (!result.ok) {
      throw new BadRequestException({
        code: 'CRITERIO_REGRAS_INVALIDAS',
        message: 'Regras do critério inválidas.',
        details: result.errors,
      });
    }

    // 2. FKs por UUID
    let unidadeFaturamentoId: bigint | null = null;
    if (dto.unidadeFaturamentoUuid !== undefined) {
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

    let unidadeAtendimentoId: bigint | null = null;
    if (dto.unidadeAtendimentoUuid !== undefined) {
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

    // 3. INSERT
    const inserted = await this.repo.insertCriterio({
      tenantId: ctx.tenantId,
      descricao: dto.descricao,
      vigenciaInicio: dto.vigenciaInicio,
      vigenciaFim: dto.vigenciaFim ?? null,
      unidadeFaturamentoId,
      unidadeAtendimentoId,
      tipoBaseCalculo: dto.tipoBaseCalculo,
      momentoRepasse: dto.momentoRepasse,
      diaFechamento: dto.diaFechamento ?? null,
      prazoDias: dto.prazoDias ?? null,
      prioridade: dto.prioridade ?? 1,
      ativo: dto.ativo ?? true,
      regras: result.regras,
      userId: ctx.userId,
    });

    // 4. audit
    await this.auditoria.record({
      tabela: 'criterios_repasse',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'criterio_repasse.criado',
        descricao: dto.descricao,
        vigencia_inicio: dto.vigenciaInicio,
        vigencia_fim: dto.vigenciaFim ?? null,
        tipo_base_calculo: dto.tipoBaseCalculo,
        prioridade: dto.prioridade ?? 1,
      },
      finalidade: 'criterio_repasse.criado',
    });

    const row = await this.repo.findCriterioByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Critério criado não encontrado (RLS?).');
    }
    return presentCriterio(row);
  }
}
