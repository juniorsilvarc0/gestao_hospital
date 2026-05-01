/**
 * `POST /v1/atendimentos/:uuid/internar` — INVARIANTE CRÍTICA #2.
 *
 * Fluxo:
 *   1. Busca atendimento (FOR UPDATE) — protege contra dupla
 *      internação simultânea no MESMO atendimento.
 *   2. Aceita estados de origem: EM_ESPERA, EM_ATENDIMENTO,
 *      EM_TRIAGEM, AGENDADO. Estados terminais ou já INTERNADO →
 *      409.
 *   3. `LeitoAllocator.alocar` (SELECT FOR UPDATE + UPDATE com
 *      versão) — qualquer race condition resulta em
 *      `LeitoConflictError`.
 *   4. UPDATE atendimentos: `leito_id`, `status='INTERNADO'`,
 *      `versao+1`.
 *   5. Audit `atendimento.internado` + `leito.alocado`.
 *   6. Emit events `atendimento.internado` e `leito.alocado`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { InternarDto } from '../dto/internar.dto';
import type { AtendimentoResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { LeitoAllocator } from '../infrastructure/leito-allocator';
import { LeitoConflictError } from '../infrastructure/leito-conflict.error';
import { presentAtendimento } from './atendimento.presenter';

const ALLOWED_ORIGIN_STATUSES = new Set([
  'AGENDADO',
  'EM_ESPERA',
  'EM_TRIAGEM',
  'EM_ATENDIMENTO',
]);

@Injectable()
export class InternarUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly allocator: LeitoAllocator,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: InternarDto,
  ): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('InternarUseCase requires a request context.');
    }

    // 1+2. Atendimento + lock + estado.
    const atend = await this.repo.findAtendimentoLockedByUuid(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (!ALLOWED_ORIGIN_STATUSES.has(atend.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_INVALIDO',
        message: `Atendimento em status ${atend.status} não pode ser internado.`,
      });
    }
    if (atend.leito_id !== null) {
      throw new ConflictException({
        code: 'ATENDIMENTO_JA_INTERNADO',
        message: 'Atendimento já possui leito alocado.',
      });
    }

    // 3. Alocação atômica.
    const alocacao = await this.allocator.alocar({
      leitoUuid: dto.leitoUuid,
      leitoVersao: dto.leitoVersao,
      atendimentoId: atend.id,
      pacienteId: atend.paciente_id,
    });

    // 4. Atualiza atendimento.
    await this.repo.setLeitoEStatusInternado(
      atend.id,
      alocacao.leitoId,
      ctx.userId,
    );

    // 5. Auditoria.
    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.internado',
        leito_id: alocacao.leitoId.toString(),
        leito_uuid: dto.leitoUuid,
        leito_versao_anterior: dto.leitoVersao,
        leito_versao_nova: alocacao.novaVersao,
      },
      finalidade: 'atendimento.internado',
    });
    await this.auditoria.record({
      tabela: 'leitos',
      registroId: alocacao.leitoId,
      operacao: 'U',
      diff: {
        evento: 'leito.alocado',
        atendimento_id: atend.id.toString(),
        paciente_id: atend.paciente_id.toString(),
        nova_versao: alocacao.novaVersao,
      },
      finalidade: 'leito.alocado',
    });

    // 6. Events para Trilha B emitir WS.
    this.events.emit('leito.alocado', {
      tenantId: ctx.tenantId.toString(),
      leitoId: alocacao.leitoId.toString(),
      leitoUuid: dto.leitoUuid,
      atendimentoId: atend.id.toString(),
      atendimentoUuid,
      pacienteId: atend.paciente_id.toString(),
      novaVersao: alocacao.novaVersao,
    });
    this.events.emit('atendimento.internado', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atend.id.toString(),
      atendimentoUuid,
      leitoId: alocacao.leitoId.toString(),
    });

    const updated = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (updated === null) {
      throw new Error('Atendimento atualizado não encontrado.');
    }
    return presentAtendimento(updated);
  }

  /**
   * Re-exposição do tipo de erro para que o Controller distinga
   * conflitos de leito (409 com payload customizado) de demais
   * conflitos.
   */
  static isLeitoConflict(err: unknown): err is LeitoConflictError {
    return err instanceof LeitoConflictError;
  }
}
