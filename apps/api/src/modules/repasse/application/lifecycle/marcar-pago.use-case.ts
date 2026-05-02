/**
 * `POST /v1/repasse/{uuid}/marcar-pago` — LIBERADO → PAGO.
 *
 * Após PAGO o trigger `tg_repasse_imutavel` impede mudanças (exceto
 * cancelamento via `cancelar-repasse.use-case.ts`).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  nextRepasseStatus,
  type RepasseStatus,
} from '../../domain/repasse-lifecycle';
import type { MarcarPagoDto } from '../../dto/marcar-pago.dto';
import type { RepasseResponse } from '../../dto/responses-lifecycle';
import { RepasseRepository } from '../../infrastructure/repasse.repository';
import { presentRepasse } from './repasse.presenter';

function buildObservacao(
  base: string | null | undefined,
  comprovanteUrl: string | null | undefined,
): string | null {
  if (
    (base === undefined || base === null || base.trim() === '') &&
    (comprovanteUrl === undefined || comprovanteUrl === null || comprovanteUrl.trim() === '')
  ) {
    return null;
  }
  const parts: string[] = [];
  if (base !== undefined && base !== null && base.trim() !== '') {
    parts.push(base.trim());
  }
  if (
    comprovanteUrl !== undefined &&
    comprovanteUrl !== null &&
    comprovanteUrl.trim() !== ''
  ) {
    parts.push(`Comprovante: ${comprovanteUrl.trim()}`);
  }
  return parts.join(' | ');
}

@Injectable()
export class MarcarPagoUseCase {
  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    repasseUuid: string,
    dto: MarcarPagoDto,
  ): Promise<RepasseResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'MarcarPagoUseCase chamado fora do contexto de request.',
      );
    }

    const row = await this.repo.findRepasseByUuid(repasseUuid);
    if (row === null) {
      throw new NotFoundException({
        code: 'REPASSE_NOT_FOUND',
        message: 'Repasse não encontrado.',
      });
    }

    const target = nextRepasseStatus(
      row.status as RepasseStatus,
      'marcar_pago',
    );
    if (target === null) {
      throw new UnprocessableEntityException({
        code: 'REPASSE_TRANSICAO_INVALIDA',
        message: `Repasse em status ${row.status} não pode ser marcado como pago.`,
      });
    }

    const observacao = buildObservacao(dto.observacao, dto.comprovanteUrl);

    await this.repo.updateRepasseMarcarPago({
      id: row.id,
      userId: ctx.userId,
      dataPagamento: dto.dataPagamento,
      observacao,
    });

    await this.auditoria.record({
      tabela: 'repasses',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'repasse.pago',
        status_anterior: row.status,
        status_novo: target,
        data_pagamento: dto.dataPagamento,
        comprovante_url: dto.comprovanteUrl ?? null,
      },
      finalidade: 'repasse.pago',
    });

    const updated = await this.repo.findRepasseByUuid(repasseUuid);
    if (updated === null) {
      throw new Error('Repasse após pagamento não encontrado (RLS?).');
    }
    return presentRepasse(updated);
  }
}
