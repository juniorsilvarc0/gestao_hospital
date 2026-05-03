/**
 * `POST /v1/portal/paciente/notificacoes/{uuid}/marcar-lida`.
 *
 * Regras:
 *   - Notificação precisa pertencer ao paciente (RLS + filtro
 *     paciente_id).
 *   - Status candidatos a virar `LIDA`: `PENDENTE`, `ENVIADA`,
 *     `ENTREGUE`. Para `FALHA`/`LIDA`, retornamos no-op com 200 — o
 *     idempotente é mais amigável que 409 em UI mobile.
 *   - Sempre carimba `data_leitura = COALESCE(data_leitura, now())`.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';

const STATUS_TRANSITIONABLE = new Set(['PENDENTE', 'ENVIADA', 'ENTREGUE']);

@Injectable()
export class MarcarLidaUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    notificacaoUuid: string,
  ): Promise<{ marcada: boolean; status: string }> {
    const ctx = await this.resolver.resolve();
    const row = await this.repo.findNotificacaoByUuid(
      ctx.pacienteId,
      notificacaoUuid,
    );
    if (row === null) {
      throw new NotFoundException({
        code: 'NOTIFICACAO_NAO_ENCONTRADA',
        message: 'Notificação não encontrada para o paciente.',
      });
    }

    if (!STATUS_TRANSITIONABLE.has(row.status)) {
      // Idempotente — já estava lida ou em estado terminal.
      return { marcada: false, status: row.status };
    }

    await this.repo.marcarNotificacaoLida(row.id);
    await this.auditoria.record({
      tabela: 'notificacoes_paciente',
      registroId: row.id,
      operacao: 'U',
      diff: {
        evento: 'notificacao.marcada_lida',
        status_anterior: row.status,
        status_novo: 'LIDA',
      },
      finalidade: 'notificacao.marcada_lida',
    });

    return { marcada: true, status: 'LIDA' };
  }
}
