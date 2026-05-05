/**
 * Use case: `POST /v1/lgpd/solicitacoes/correcao` (Art. 18 III).
 *
 * Solicita correção de dados pessoais. `dadosAdicionais` deve carregar
 * os campos a corrigir (estrutura livre, registrada no motivo). NÃO
 * altera o cadastro — apenas registra.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import type { CriarSolicitacaoDto } from '../dto/criar-solicitacao.dto';
import type { SolicitacaoCriadaResponse } from '../dto/responses';
import { LgpdRepository } from '../infrastructure/lgpd.repository';

@Injectable()
export class CriarSolicitacaoCorrecaoUseCase {
  constructor(private readonly repo: LgpdRepository) {}

  async execute(
    dto: CriarSolicitacaoDto,
    accessCtx?: { ip: string | null; userAgent: string | null },
  ): Promise<SolicitacaoCriadaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CriarSolicitacaoCorrecaoUseCase requires a request context.',
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
      tipo: 'CORRECAO',
      motivo: dto.motivo ?? null,
      dadosAdicionais: dto.dadosAdicionais ?? null,
      ipOrigem: accessCtx?.ip ?? null,
      userAgent: accessCtx?.userAgent ?? null,
      solicitanteId: ctx.userId,
    });

    return {
      uuid: inserted.uuid_externo,
      pacienteUuid: inserted.paciente_uuid,
      tipo: 'CORRECAO',
      status: 'PENDENTE',
      prazoSlaDias: inserted.prazo_sla_dias,
      solicitadaEm: inserted.solicitada_em.toISOString(),
      mensagem:
        'Solicitação de correção registrada (Art. 18 III). Será revisada e ' +
        'aplicada após validação documental pelo Encarregado de Dados.',
    };
  }
}
