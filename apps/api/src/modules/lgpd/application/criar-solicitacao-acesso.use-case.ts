/**
 * Use case: `POST /v1/lgpd/solicitacoes/acesso` (Art. 18 II — RN-LGP-02).
 *
 * Registra solicitação de ACESSO aos dados pessoais. NÃO entrega os
 * dados — gera registro para o Encarregado/DPO atender (com export
 * dual-approval, se aplicável). SLA padrão: 15 dias (Art. 19 §1º).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import type { CriarSolicitacaoDto } from '../dto/criar-solicitacao.dto';
import type { SolicitacaoCriadaResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';

@Injectable()
export class CriarSolicitacaoAcessoUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(
    dto: CriarSolicitacaoDto,
    accessCtx?: { ip: string | null; userAgent: string | null },
  ): Promise<SolicitacaoCriadaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CriarSolicitacaoAcessoUseCase requires a request context.',
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
      tipo: 'ACESSO',
      motivo: dto.motivo ?? null,
      dadosAdicionais: dto.dadosAdicionais ?? null,
      ipOrigem: accessCtx?.ip ?? null,
      userAgent: accessCtx?.userAgent ?? null,
      solicitanteId: ctx.userId,
    });

    return {
      uuid: inserted.uuid_externo,
      pacienteUuid: inserted.paciente_uuid,
      tipo: 'ACESSO',
      status: 'PENDENTE',
      prazoSlaDias: inserted.prazo_sla_dias,
      solicitadaEm: inserted.solicitada_em.toISOString(),
      mensagem:
        'Solicitação de acesso registrada (Art. 18 II). Será atendida pelo ' +
        'Encarregado de Dados/DPO em até 15 dias.',
    };
  }
}
