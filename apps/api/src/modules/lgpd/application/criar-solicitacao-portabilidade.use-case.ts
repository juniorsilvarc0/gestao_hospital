/**
 * Use case: `POST /v1/lgpd/solicitacoes/portabilidade` (Art. 18 V).
 *
 * Solicita a portabilidade dos dados a outro fornecedor. Por enquanto
 * registra a intenção; a entrega efetiva acontece via export FHIR
 * dual-approval (`POST /v1/lgpd/exports`).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import type { CriarSolicitacaoDto } from '../dto/criar-solicitacao.dto';
import type { SolicitacaoCriadaResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';

@Injectable()
export class CriarSolicitacaoPortabilidadeUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(
    dto: CriarSolicitacaoDto,
    accessCtx?: { ip: string | null; userAgent: string | null },
  ): Promise<SolicitacaoCriadaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CriarSolicitacaoPortabilidadeUseCase requires a request context.',
      );
    }

    const pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const inserted = await this.repo.insertSolicitacao({
      tenantId: ctx.tenantId,
      pacienteId,
      tipo: 'PORTABILIDADE',
      motivo: dto.motivo ?? null,
      dadosAdicionais: dto.dadosAdicionais ?? null,
      ipOrigem: accessCtx?.ip ?? null,
      userAgent: accessCtx?.userAgent ?? null,
      solicitanteId: ctx.userId,
    });

    return {
      uuid: inserted.uuid_externo,
      pacienteUuid: inserted.paciente_uuid,
      tipo: 'PORTABILIDADE',
      status: 'PENDENTE',
      prazoSlaDias: inserted.prazo_sla_dias,
      solicitadaEm: inserted.solicitada_em.toISOString(),
      mensagem:
        'Solicitação de portabilidade registrada (Art. 18 V). A entrega ' +
        'ocorrerá em formato FHIR após dupla aprovação (DPO + Supervisor).',
    };
  }
}
