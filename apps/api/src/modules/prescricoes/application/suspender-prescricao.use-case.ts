/**
 * `POST /v1/prescricoes/:uuid/suspender` (RN-PRE-05).
 *
 * Sem `itemUuid` → suspende a prescrição inteira:
 *   - UPDATE `prescricoes.status = 'SUSPENSA'`, `suspensa_em = now()`,
 *     `suspensa_motivo`.
 *   - UPDATE todos os itens `status_item = 'SUSPENSO'`.
 * Com `itemUuid` → suspende somente aquele item:
 *   - UPDATE `prescricoes_itens.status_item = 'SUSPENSO'`.
 *   - Cabeçalho não muda (paciente segue com outros itens ativos).
 *
 * **Imutabilidade**: a trigger `tg_imutavel_apos_assinatura` em
 * `prescricoes` permite UPDATE em colunas `status`, `suspensa_em`,
 * `suspensa_motivo`, `updated_at` — exceções declaradas na trigger
 * (ver migration Fase 6). Itens (`prescricoes_itens`) também têm
 * exceção para `status_item`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { SuspenderDto } from '../dto/suspender.dto';
import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { presentPrescricao } from './prescricao.presenter';

const STATUS_TERMINAL = new Set(['CANCELADA', 'ENCERRADA', 'RECUSADA_FARMACIA']);

@Injectable()
export class SuspenderPrescricaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrescricoesRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string, dto: SuspenderDto): Promise<PrescricaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('SuspenderPrescricaoUseCase requires a request context.');
    }

    const presc = await this.repo.findPrescricaoByUuid(uuid);
    if (presc === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_NOT_FOUND',
        message: 'Prescrição não encontrada.',
      });
    }
    if (STATUS_TERMINAL.has(presc.status)) {
      throw new ConflictException({
        code: 'PRESCRICAO_STATUS_INVALIDO',
        message: `Não é possível suspender prescrição com status ${presc.status}.`,
      });
    }

    const tx = this.prisma.tx();

    if (dto.itemUuid !== undefined) {
      // Suspende apenas o item.
      const item = await this.repo.findItemByUuid(dto.itemUuid);
      if (item === null) {
        throw new NotFoundException({
          code: 'PRESCRICAO_ITEM_NOT_FOUND',
          message: 'Item não encontrado.',
        });
      }
      if (item.prescricao_id !== presc.id) {
        throw new ConflictException({
          code: 'PRESCRICAO_ITEM_INCONSISTENTE',
          message: 'Item não pertence à prescrição informada.',
        });
      }
      if (item.status_item === 'SUSPENSO') {
        throw new ConflictException({
          code: 'PRESCRICAO_ITEM_JA_SUSPENSO',
          message: 'Item já está suspenso.',
        });
      }
      await tx.$executeRaw`
        UPDATE prescricoes_itens
           SET status_item = 'SUSPENSO',
               updated_at  = now()
         WHERE id = ${item.id}::bigint
      `;

      await this.auditoria.record({
        tabela: 'prescricoes_itens',
        registroId: item.id,
        operacao: 'U',
        diff: {
          evento: 'prescricao_item.suspenso',
          prescricao_id: presc.id.toString(),
          item_uuid: dto.itemUuid,
          motivo: dto.motivo,
        },
        finalidade: 'prescricao_item.suspenso',
      });
    } else {
      // Suspende a prescrição inteira (cabeçalho + todos os itens).
      if (presc.status === 'SUSPENSA') {
        throw new ConflictException({
          code: 'PRESCRICAO_JA_SUSPENSA',
          message: 'Prescrição já está suspensa.',
        });
      }
      await tx.$executeRaw`
        UPDATE prescricoes
           SET status         = 'SUSPENSA'::enum_prescricao_status,
               suspensa_em    = now(),
               suspensa_motivo = ${dto.motivo},
               updated_at     = now()
         WHERE id = ${presc.id}::bigint
           AND data_hora = ${presc.data_hora}::timestamptz
      `;
      await tx.$executeRaw`
        UPDATE prescricoes_itens
           SET status_item = 'SUSPENSO',
               updated_at  = now()
         WHERE prescricao_id = ${presc.id}::bigint
           AND status_item   = 'ATIVO'
      `;

      await this.auditoria.record({
        tabela: 'prescricoes',
        registroId: presc.id,
        operacao: 'U',
        diff: {
          evento: 'prescricao.suspensa',
          motivo: dto.motivo,
          status_anterior: presc.status,
        },
        finalidade: 'prescricao.suspensa',
      });

      this.events.emit('prescricao.suspensa', {
        prescricaoUuid: presc.uuid_externo,
        atendimentoUuid: presc.atendimento_uuid,
        pacienteUuid: presc.paciente_uuid,
        motivo: dto.motivo,
      });
    }

    const updated = await this.repo.findPrescricaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Prescrição suspensa não encontrada.');
    }
    const itens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(updated, itens);
  }
}
