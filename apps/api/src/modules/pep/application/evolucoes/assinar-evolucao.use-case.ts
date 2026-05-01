/**
 * `POST /v1/evolucoes/:uuid/assinar` — assina ICP-Brasil (RN-PEP-02).
 *
 * Fluxo:
 *   1. Carrega snapshot da evolução.
 *   2. Se já assinada → 409.
 *   3. Resolve prestador do usuário logado (titular da assinatura).
 *   4. Chama `IcpBrasilService.assinar({payload: conteudo + metadados})`.
 *   5. UPDATE evolução: `assinatura_digital = JSONB`, `assinada_em = now()`.
 *   6. Audit `evolucao.assinada`.
 *
 * Após esse update, qualquer UPDATE/DELETE adicional na evolução é
 * bloqueado pelo trigger DDL `tg_imutavel_apos_assinatura` (banco).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { AssinarDto } from '../../dto/assinar.dto';
import { IcpBrasilService } from '../../infrastructure/icp-brasil.service';
import { PepRepository } from '../../infrastructure/pep.repository';
import { presentEvolucao, type EvolucaoResponse } from './evolucao.presenter';

@Injectable()
export class AssinarEvolucaoUseCase {
  constructor(
    private readonly repo: PepRepository,
    private readonly icp: IcpBrasilService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: AssinarDto): Promise<EvolucaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AssinarEvolucaoUseCase requires a request context.');
    }

    const snapshot = await this.repo.findEvolucaoSnapshot(uuid);
    if (snapshot === null) {
      throw new NotFoundException({
        code: 'EVOLUCAO_NOT_FOUND',
        message: 'Evolução não encontrada.',
      });
    }
    if (snapshot.assinada_em !== null) {
      throw new ConflictException({
        code: 'EVOLUCAO_JA_ASSINADA',
        message: 'Evolução já está assinada (RN-PEP-03).',
      });
    }

    const prestador = await this.repo.findPrestadorIdByUser(ctx.userId);
    if (prestador === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message: 'Usuário não possui cadastro de prestador para assinar.',
      });
    }
    const prestBasic = await this.repo.findPrestadorBasic(prestador);

    const assinatura = await this.icp.assinar({
      payload: {
        evolucao_uuid: uuid,
        atendimento_id: snapshot.atendimento_id.toString(),
        paciente_id: snapshot.paciente_id.toString(),
        profissional_id: snapshot.profissional_id.toString(),
        conteudo: snapshot.conteudo,
        data_hora: snapshot.data_hora.toISOString(),
      },
      certPemBase64: dto.certPemBase64,
      p12Base64: dto.p12Base64,
      p12Senha: dto.p12Senha,
      stubTitular: prestBasic?.nome ?? 'Prestador HMS-BR',
    });

    await this.repo.assinarEvolucao(
      snapshot.id,
      snapshot.data_hora,
      assinatura as unknown as Record<string, unknown>,
    );

    await this.auditoria.record({
      tabela: 'evolucoes',
      registroId: snapshot.id,
      operacao: 'U',
      diff: {
        evento: 'evolucao.assinada',
        algoritmo: assinatura.algoritmo,
        hash_prefix: assinatura.hash.slice(0, 16),
        simulado: assinatura.stub,
        // PHI-safe: nenhum conteúdo
      },
      finalidade: 'evolucao.assinada',
    });

    const updated = await this.repo.findEvolucaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Evolução assinada não encontrada.');
    }
    return presentEvolucao(updated);
  }
}
