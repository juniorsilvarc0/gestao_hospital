/**
 * `POST /v1/dispensacoes` — cria dispensação em status `PENDENTE`
 * (RN-FAR-01, RN-FAR-02, RN-FAR-03, RN-FAR-06).
 *
 * Validações:
 *   1. Atendimento existe.
 *   2. Tipo:
 *      - `PRESCRICAO`     → prescrição existe e está ATIVA ou
 *                           APROVADA_RESSALVAS (RN-FAR-01).
 *                           prescrição precisa pertencer ao mesmo
 *                           atendimento (defesa contra mistura).
 *      - `AVULSA`         → exige `motivoAvulsa` + permissão
 *                           granular `dispensacao:avulsa`.
 *      - `KIT_CIRURGICO`  → cirurgia existe e pertence ao atendimento.
 *                           Se `itens` vazio e a cirurgia tem
 *                           `kit_cirurgico_id`, expandimos os itens do
 *                           kit (RN-FAR-06).
 *   3. Procedimentos resolvidos por UUID.
 *   4. Para cada item, se `quantidade_dispensada ≠ quantidade_prescrita
 *      × fator_conversao` (com tolerância 1e-6), exige
 *      `justificativa_divergencia` (RN-FAR-03).
 *
 * Após validar, INSERT cabeçalho + N itens, audita `dispensacao.criada`,
 * emite evento de domínio (gateway WebSocket consome).
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { PermissionChecker } from '../../../prescricoes/infrastructure/permission-checker.service';
import {
  turnoFromDate,
  type DispensacaoTipo,
} from '../../domain/dispensacao';
import type {
  CreateDispensacaoDto,
  DispensacaoItemInputDto,
} from '../../dto/create-dispensacao.dto';
import type { DispensacaoResponse } from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentDispensacao } from './dispensacao.presenter';

const TOLERANCIA = 1e-6;

interface ItemPlan {
  procedimentoId: bigint;
  procedimentoUuid: string;
  prescricaoItemId: bigint | null;
  quantidadePrescrita: number;
  quantidadeDispensada: number;
  unidadeMedida: string | null;
  fatorConversaoAplicado: number | null;
  justificativaDivergencia: string | null;
  lote: string | null;
  validade: string | null;
}

@Injectable()
export class CreateDispensacaoUseCase {
  constructor(
    private readonly repo: FarmaciaRepository,
    private readonly permissions: PermissionChecker,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: CreateDispensacaoDto): Promise<DispensacaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateDispensacaoUseCase requires a request context.');
    }

    if (Number.isNaN(Date.parse(dto.dataHora))) {
      throw new BadRequestException({
        code: 'DISPENSACAO_DATAHORA_INVALIDA',
        message: 'dataHora inválida.',
      });
    }
    const dataHora = new Date(dto.dataHora);

    // 1. Atendimento.
    const atendimento = await this.repo.findAtendimentoBasics(
      dto.atendimentoUuid,
    );
    if (atendimento === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }

    // 2. Farmacêutico (usuário logado).
    const farmaceuticoId = await this.repo.findPrestadorIdByUserId(
      ctx.userId,
    );
    if (farmaceuticoId === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message:
          'Usuário não está vinculado a um cadastro de prestador (farmacêutico).',
      });
    }

    // 3. Setor destino (opcional).
    let setorDestinoId: bigint | null = null;
    if (dto.setorDestinoUuid !== undefined) {
      setorDestinoId = await this.repo.findSetorIdByUuid(
        dto.setorDestinoUuid,
      );
      if (setorDestinoId === null) {
        throw new NotFoundException({
          code: 'SETOR_NOT_FOUND',
          message: 'Setor destino não encontrado.',
        });
      }
    }

    // 4. Plano por tipo.
    let prescricaoId: bigint | null = null;
    let prescricaoDataHora: Date | null = null;
    let cirurgiaId: bigint | null = null;
    let plan: ItemPlan[] = [];

    if (dto.tipo === 'PRESCRICAO') {
      if (dto.prescricaoUuid === undefined) {
        throw new BadRequestException({
          code: 'PRESCRICAO_REQUIRED',
          message: 'tipo=PRESCRICAO exige prescricaoUuid.',
        });
      }
      const presc = await this.repo.findPrescricaoMin(dto.prescricaoUuid);
      if (presc === null) {
        throw new NotFoundException({
          code: 'PRESCRICAO_NOT_FOUND',
          message: 'Prescrição não encontrada.',
        });
      }
      // RN-FAR-01: só aceita ATIVA. APROVADA_RESSALVAS é representada
      // no schema como ATIVA também (a análise farmacêutica já decidiu
      // o status final em `analisar-prescricao`).
      if (presc.status !== 'ATIVA') {
        throw new UnprocessableEntityException({
          code: 'PRESCRICAO_STATUS_INVALIDO',
          message: `Prescrição com status ${presc.status} não pode ser dispensada (RN-FAR-01).`,
        });
      }
      if (presc.atendimentoId !== atendimento.id) {
        throw new UnprocessableEntityException({
          code: 'PRESCRICAO_ATENDIMENTO_MISMATCH',
          message: 'Prescrição não pertence ao atendimento informado.',
        });
      }
      prescricaoId = presc.id;
      prescricaoDataHora = presc.dataHora;
      plan = await this.buildPlanForPrescricao(dto.itens);
    } else if (dto.tipo === 'AVULSA') {
      if (
        dto.motivoAvulsa === undefined ||
        dto.motivoAvulsa.trim().length < 5
      ) {
        throw new BadRequestException({
          code: 'AVULSA_MOTIVO_REQUIRED',
          message:
            'tipo=AVULSA exige motivoAvulsa (≥ 5 chars) — RN-FAR-01.',
        });
      }
      const allow = await this.permissions.hasPermission(
        ctx.userId,
        'dispensacao',
        'avulsa',
      );
      if (!allow) {
        throw new ForbiddenException({
          code: 'AVULSA_FORBIDDEN',
          message:
            'Usuário sem permissão dispensacao:avulsa para dispensar sem prescrição.',
        });
      }
      if (dto.itens.length === 0) {
        throw new BadRequestException({
          code: 'DISPENSACAO_ITENS_REQUIRED',
          message: 'Pelo menos um item é necessário para AVULSA.',
        });
      }
      plan = await this.buildPlanForPrescricao(dto.itens);
    } else if (dto.tipo === 'KIT_CIRURGICO') {
      if (dto.cirurgiaUuid === undefined) {
        throw new BadRequestException({
          code: 'CIRURGIA_REQUIRED',
          message: 'tipo=KIT_CIRURGICO exige cirurgiaUuid.',
        });
      }
      const cir = await this.repo.findCirurgiaMin(dto.cirurgiaUuid);
      if (cir === null) {
        throw new NotFoundException({
          code: 'CIRURGIA_NOT_FOUND',
          message: 'Cirurgia não encontrada.',
        });
      }
      if (cir.atendimentoId !== atendimento.id) {
        throw new UnprocessableEntityException({
          code: 'CIRURGIA_ATENDIMENTO_MISMATCH',
          message: 'Cirurgia não pertence ao atendimento informado.',
        });
      }
      cirurgiaId = cir.id;
      if (dto.itens.length === 0) {
        if (cir.kitCirurgicoId === null) {
          throw new BadRequestException({
            code: 'KIT_NOT_LINKED',
            message:
              'Cirurgia não tem kit cirúrgico associado e nenhum item foi informado (RN-FAR-06).',
          });
        }
        plan = await this.expandKit(cir.kitCirurgicoId);
      } else {
        plan = await this.buildPlanForPrescricao(dto.itens);
      }
    } else {
      // Defesa adicional — class-validator já bloqueia outras opções.
      throw new BadRequestException({
        code: 'TIPO_INVALIDO',
        message: 'Tipo de dispensação inválido para criação.',
      });
    }

    // 5. INSERT (estamos na $transaction global do interceptor).
    const turno = turnoFromDate(dataHora);
    const inserted = await this.repo.insertDispensacao({
      tenantId: ctx.tenantId,
      atendimentoId: atendimento.id,
      pacienteId: atendimento.pacienteId,
      prescricaoId,
      prescricaoDataHora,
      cirurgiaId,
      setorDestinoId,
      farmaceuticoId,
      dataHora: dto.dataHora,
      turno,
      tipo: dto.tipo as DispensacaoTipo,
      observacao:
        dto.tipo === 'AVULSA'
          ? `AVULSA: ${dto.motivoAvulsa ?? ''}` +
            (dto.observacao !== undefined ? ` — ${dto.observacao}` : '')
          : dto.observacao ?? null,
      dispensacaoOrigemId: null,
      dispensacaoOrigemDataHora: null,
      userId: ctx.userId,
    });

    for (const item of plan) {
      await this.repo.insertDispensacaoItem({
        tenantId: ctx.tenantId,
        dispensacaoId: inserted.id,
        dispensacaoDataHora: inserted.dataHora,
        procedimentoId: item.procedimentoId,
        prescricaoItemId: item.prescricaoItemId,
        quantidadePrescrita: item.quantidadePrescrita,
        quantidadeDispensada: item.quantidadeDispensada,
        unidadeMedida: item.unidadeMedida,
        fatorConversaoAplicado: item.fatorConversaoAplicado,
        justificativaDivergencia: item.justificativaDivergencia,
        lote: item.lote,
        validade: item.validade,
      });
    }

    await this.auditoria.record({
      tabela: 'dispensacoes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'dispensacao.criada',
        atendimento_id: atendimento.id.toString(),
        tipo: dto.tipo,
        n_itens: plan.length,
        prescricao_id: prescricaoId?.toString() ?? null,
        cirurgia_id: cirurgiaId?.toString() ?? null,
      },
      finalidade: 'dispensacao.criada',
    });

    const created = await this.repo.findDispensacaoByUuid(inserted.uuidExterno);
    if (created === null) {
      throw new Error('Dispensação criada não encontrada (RLS?).');
    }
    const itens = await this.repo.findItensByDispensacaoId(
      inserted.id,
      inserted.dataHora,
    );
    const presented = presentDispensacao(created, itens);

    this.events.emit('dispensacao.criada', {
      tenantId: ctx.tenantId.toString(),
      dispensacao: presented,
    });

    return presented;
  }

  /**
   * Resolve procedimentos por UUID + valida divergência (RN-FAR-03).
   * Também resolve `prescricaoItemId` (quando o caller informou
   * `prescricaoItemUuid`).
   */
  private async buildPlanForPrescricao(
    itensDto: DispensacaoItemInputDto[],
  ): Promise<ItemPlan[]> {
    if (itensDto.length === 0) return [];
    const procUuids = itensDto.map((i) => i.procedimentoUuid);
    const procs = await this.repo.findProcedimentosByUuids(procUuids);
    const missing = procUuids.filter((u) => !procs.has(u));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missing.join(', ')}`,
      });
    }
    const itemUuids = itensDto
      .map((i) => i.prescricaoItemUuid)
      .filter((v): v is string => v !== undefined);
    const itensMap = await this.repo.findPrescricaoItemIds(itemUuids);
    const missingItens = itemUuids.filter((u) => !itensMap.has(u));
    if (missingItens.length > 0) {
      throw new NotFoundException({
        code: 'PRESCRICAO_ITEM_NOT_FOUND',
        message: `Itens de prescrição não encontrados: ${missingItens.join(
          ', ',
        )}`,
      });
    }

    return itensDto.map((it, idx) => {
      const proc = procs.get(it.procedimentoUuid);
      if (proc === undefined) {
        throw new Error('procedimento sumiu após resolução');
      }
      const fator =
        it.fatorConversaoAplicado ??
        (proc.fatorConversao !== null ? Number(proc.fatorConversao) : 1);
      const esperado = it.quantidadePrescrita * fator;
      const diff = Math.abs(esperado - it.quantidadeDispensada);
      const divergente = diff > TOLERANCIA;
      if (
        divergente &&
        (it.justificativaDivergencia === undefined ||
          it.justificativaDivergencia.trim().length < 5)
      ) {
        throw new UnprocessableEntityException({
          code: 'DISPENSACAO_DIVERGENCIA_SEM_JUSTIFICATIVA',
          message: `Item #${idx + 1}: divergência prescrita×dispensada exige justificativa (RN-FAR-03).`,
          detalhes: {
            procedimentoUuid: it.procedimentoUuid,
            quantidadePrescrita: it.quantidadePrescrita,
            quantidadeDispensada: it.quantidadeDispensada,
            fatorConversaoAplicado: fator,
            esperado,
          },
        });
      }
      return {
        procedimentoId: proc.id,
        procedimentoUuid: it.procedimentoUuid,
        prescricaoItemId:
          it.prescricaoItemUuid !== undefined
            ? itensMap.get(it.prescricaoItemUuid)?.id ?? null
            : null,
        quantidadePrescrita: it.quantidadePrescrita,
        quantidadeDispensada: it.quantidadeDispensada,
        unidadeMedida: it.unidadeMedida ?? null,
        fatorConversaoAplicado: fator,
        justificativaDivergencia: it.justificativaDivergencia ?? null,
        lote: it.lote ?? null,
        validade: it.validade ?? null,
      };
    });
  }

  /**
   * Expansão do kit cirúrgico em itens da dispensação. `quantidade
   * prescrita = quantidade do kit`; `dispensada = idem` (sem divergência
   * inicial). O operador pode revisar lote/validade na separação.
   */
  private async expandKit(kitId: bigint): Promise<ItemPlan[]> {
    const kitItens = await this.repo.findKitItens(kitId);
    if (kitItens.length === 0) return [];
    const procIds = kitItens.map((k) => k.procedimentoId);
    const procs = await this.repo.findProcedimentosByIds(procIds);
    return kitItens.map((k) => {
      const proc = procs.get(k.procedimentoId);
      const qtd = Number(k.quantidade);
      return {
        procedimentoId: k.procedimentoId,
        procedimentoUuid: proc?.uuid ?? '',
        prescricaoItemId: null,
        quantidadePrescrita: qtd,
        quantidadeDispensada: qtd,
        unidadeMedida: null,
        fatorConversaoAplicado:
          proc?.fatorConversao !== undefined && proc.fatorConversao !== null
            ? Number(proc.fatorConversao)
            : 1,
        justificativaDivergencia: null,
        lote: null,
        validade: null,
      };
    });
  }
}
