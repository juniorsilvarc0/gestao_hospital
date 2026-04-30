/**
 * Use case: `POST /v1/lgpd/solicitacoes/exclusao`.
 *
 * **NÃO apaga** dados — apenas registra a solicitação para revisão
 * pelo Encarregado/DPO (RN-LGP-03). Prontuário clínico tem retenção
 * mínima de 20 anos (CFM 1.638/2002 Art. 10), portanto a maior parte
 * das exclusões resulta em "ATENDIDA com retenção parcial" ou
 * "NEGADA por norma".
 *
 * SLA padrão: 15 dias (LGPD Art. 19 §1º). A coluna `prazo_sla_dias`
 * armazena o valor para o Encarregado priorizar.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { PacientesRepository } from '../../pacientes/infrastructure/pacientes.repository';
import type { SolicitacaoExclusaoDto } from '../dto/solicitacao-exclusao.dto';

export interface SolicitacaoCriadaResponse {
  uuid: string;
  status: 'PENDENTE';
  prazoSlaDias: number;
  solicitadaEm: string;
  mensagem: string;
}

@Injectable()
export class CriarSolicitacaoExclusaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PacientesRepository,
  ) {}

  async execute(
    dto: SolicitacaoExclusaoDto,
  ): Promise<SolicitacaoCriadaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CriarSolicitacaoExclusaoUseCase requires a request context.',
      );
    }

    const pacienteId = await this.repo.findIdByUuid(dto.pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { uuid_externo: string; solicitada_em: Date; prazo_sla_dias: number }[]
    >`
      INSERT INTO solicitacoes_lgpd
        (tenant_id, paciente_id, tipo, motivo, status, solicitante_id, prazo_sla_dias)
      VALUES
        (${ctx.tenantId}::bigint,
         ${pacienteId}::bigint,
         'EXCLUSAO'::enum_lgpd_solicitacao_tipo,
         ${dto.motivo ?? null},
         'PENDENTE'::enum_lgpd_solicitacao_status,
         ${ctx.userId}::bigint,
         15)
      RETURNING uuid_externo::text AS uuid_externo,
                solicitada_em,
                prazo_sla_dias
    `;

    return {
      uuid: rows[0].uuid_externo,
      status: 'PENDENTE',
      prazoSlaDias: rows[0].prazo_sla_dias,
      solicitadaEm: rows[0].solicitada_em.toISOString(),
      mensagem:
        'Solicitação registrada. Será revisada pelo Encarregado de Dados/DPO. ' +
        'Dados clínicos podem ser retidos por imposição CFM 1.638 (20 anos).',
    };
  }
}
