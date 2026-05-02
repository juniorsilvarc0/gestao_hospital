/**
 * `POST /v1/contas/{uuid}/itens` — lançamento manual de item (RN-FAT-06).
 *
 * Regras:
 *   - Conta precisa estar ABERTA ou EM_ELABORACAO.
 *   - DTO já valida `motivo` ≥10 chars; aqui registramos o motivo na
 *     auditoria (`finalidade='contas.item_lancado_manual'`).
 *   - Multiplica quantidade × valor_unitario para obter `valor_total`
 *     (seis casas decimais para evitar truncagem precoce — a coluna é
 *     NUMERIC(18,4) no banco e arredonda no insert).
 */
import Decimal from 'decimal.js';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { LancarItemDto } from '../../dto/lancar-item.dto';
import { ContasRepository } from '../../infrastructure/contas.repository';

export interface LancarItemResult {
  uuid: string;
  contaUuid: string;
  valorTotal: string;
}

@Injectable()
export class LancarItemManualUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    contaUuid: string,
    dto: LancarItemDto,
  ): Promise<LancarItemResult> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('LancarItemManualUseCase requires request context.');
    }

    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.status !== 'ABERTA' && conta.status !== 'EM_ELABORACAO') {
      throw new UnprocessableEntityException({
        code: 'CONTA_STATUS_INVALIDO',
        message: `Lançamento manual exige status ABERTA ou EM_ELABORACAO; atual: ${conta.status}.`,
      });
    }

    const proc = await this.repo.findProcedimentoByUuid(dto.procedimentoUuid);
    if (proc === null) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento não encontrado.',
      });
    }

    let prestadorId: bigint | null = null;
    if (dto.prestadorExecutanteUuid !== undefined) {
      prestadorId = await this.repo.findPrestadorIdByUuid(
        dto.prestadorExecutanteUuid,
      );
      if (prestadorId === null) {
        throw new UnprocessableEntityException({
          code: 'PRESTADOR_INVALIDO',
          message: 'Prestador executante não encontrado.',
        });
      }
    }

    let setorId: bigint | null = null;
    if (dto.setorUuid !== undefined) {
      setorId = await this.repo.findSetorIdByUuid(dto.setorUuid);
      if (setorId === null) {
        throw new UnprocessableEntityException({
          code: 'SETOR_INVALIDO',
          message: 'Setor não encontrado.',
        });
      }
    }

    let pacoteId: bigint | null = null;
    if (dto.pacoteUuid !== undefined) {
      pacoteId = await this.repo.findPacoteIdByUuid(dto.pacoteUuid);
      if (pacoteId === null) {
        throw new UnprocessableEntityException({
          code: 'PACOTE_INVALIDO',
          message: 'Pacote não encontrado.',
        });
      }
    }

    const quantidade = new Decimal(dto.quantidade);
    const valorUnitario = new Decimal(dto.valorUnitario);
    const valorTotal = quantidade.mul(valorUnitario);

    const inserted = await this.repo.insertContaItem({
      tenantId: ctx.tenantId,
      contaId: conta.id,
      procedimentoId: proc.id,
      grupoGasto: dto.grupoGasto,
      origem: 'MANUAL',
      origemReferenciaId: null,
      origemReferenciaTipo: 'MANUAL',
      quantidade: quantidade.toFixed(6),
      valorUnitario: valorUnitario.toFixed(6),
      valorTotal: valorTotal.toFixed(6),
      prestadorExecutanteId: prestadorId,
      setorId,
      dataRealizacao: dto.dataRealizacao ?? null,
      autorizado: dto.numeroAutorizacao !== undefined,
      numeroAutorizacao: dto.numeroAutorizacao ?? null,
      foraPacote: dto.foraPacote ?? false,
      pacoteId,
      lote: dto.loteOpme ?? null,
      validadeLote: dto.validadeLoteOpme ?? null,
      registroAnvisa: dto.registroAnvisa ?? null,
      fabricante: dto.fabricante ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'contas_itens',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'contas.item_lancado_manual',
        conta_id: conta.id.toString(),
        procedimento_uuid: dto.procedimentoUuid,
        grupo_gasto: dto.grupoGasto,
        quantidade: quantidade.toFixed(6),
        valor_unitario: valorUnitario.toFixed(6),
        valor_total: valorTotal.toFixed(6),
        motivo: dto.motivo,
      },
      finalidade: 'contas.item_lancado_manual',
    });

    return {
      uuid: inserted.uuidExterno,
      contaUuid,
      valorTotal: valorTotal.toFixed(4),
    };
  }
}
