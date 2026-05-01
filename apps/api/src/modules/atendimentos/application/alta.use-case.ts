/**
 * `POST /v1/atendimentos/:uuid/alta`.
 *
 * Fluxo:
 *   1. Busca atendimento. Já em ALTA/CANCELADO → 409.
 *   2. Valida `cidPrincipal` se `tipoAlta = OBITO` (CFM).
 *   3. UPDATE atendimentos: `data_hora_saida=now()`, `status=ALTA`,
 *      `tipo_alta`, `versao+1`. Append motivo na observação.
 *   4. Se havia leito alocado: libera leito (HIGIENIZACAO) via
 *      `LeitoAllocator.liberar`.
 *   5. Conta vai para EM_ELABORACAO (Fase 8 expande).
 *   6. Audit `atendimento.alta` + `leito.liberado`. Emit events.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { AltaDto } from '../dto/alta.dto';
import type { AtendimentoResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { LeitoAllocator } from '../infrastructure/leito-allocator';
import { presentAtendimento } from './atendimento.presenter';

@Injectable()
export class AltaUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly allocator: LeitoAllocator,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: AltaDto,
  ): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AltaUseCase requires a request context.');
    }

    const atend = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (atend.status === 'ALTA' || atend.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Atendimento já em ${atend.status}.`,
      });
    }

    if (
      dto.tipoAlta === 'OBITO' &&
      (dto.cidPrincipal === undefined || dto.cidPrincipal.trim().length === 0) &&
      (atend.cid_principal === null || atend.cid_principal.trim().length === 0)
    ) {
      throw new UnprocessableEntityException({
        code: 'OBITO_CID_REQUIRED',
        message: 'Óbito exige cidPrincipal (CFM — declaração de óbito).',
      });
    }

    await this.repo.darAlta(
      atend.id,
      dto.tipoAlta,
      dto.cidPrincipal ?? null,
      dto.motivo ?? null,
      ctx.userId,
    );

    let leitoLiberadoId: bigint | null = null;
    let leitoNovaVersao: number | null = null;
    if (atend.leito_id !== null) {
      const liberacao = await this.allocator.liberar({
        leitoId: atend.leito_id,
      });
      leitoLiberadoId = liberacao.leitoId;
      leitoNovaVersao = liberacao.novaVersao;
    }

    if (atend.conta_id !== null) {
      await this.repo.setContaEmElaboracao(atend.conta_id);
    }

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.alta',
        tipo_alta: dto.tipoAlta,
        cid_principal: dto.cidPrincipal ?? atend.cid_principal,
        motivo: dto.motivo ?? null,
      },
      finalidade: 'atendimento.alta',
    });
    if (leitoLiberadoId !== null) {
      await this.auditoria.record({
        tabela: 'leitos',
        registroId: leitoLiberadoId,
        operacao: 'U',
        diff: {
          evento: 'leito.liberado',
          atendimento_id: atend.id.toString(),
          motivo: 'alta',
          nova_versao: leitoNovaVersao,
        },
        finalidade: 'leito.liberado',
      });
      this.events.emit('leito.liberado', {
        tenantId: ctx.tenantId.toString(),
        leitoId: leitoLiberadoId.toString(),
        atendimentoId: atend.id.toString(),
        novaVersao: leitoNovaVersao,
      });
      this.events.emit('leito.higienizando', {
        tenantId: ctx.tenantId.toString(),
        leitoId: leitoLiberadoId.toString(),
      });
    }

    this.events.emit('atendimento.alta', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atend.id.toString(),
      atendimentoUuid,
      tipoAlta: dto.tipoAlta,
    });

    const updated = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (updated === null) {
      throw new Error('Atendimento atualizado não encontrado.');
    }
    return presentAtendimento(updated);
  }
}
