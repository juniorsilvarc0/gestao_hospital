/**
 * `POST /v1/prescricoes/:uuid/analisar` (RN-PRE-01) — análise farmacêutica.
 *
 * Fluxo:
 *   1. Carrega prescrição. Não pode estar:
 *      - já analisada para ATIVA/RECUSADA_FARMACIA (uma análise por
 *        prescrição decisória — re-análises ficam em histórico mas não
 *        revertam o status); a Fase 7 detalha re-análise. Aqui só
 *        rejeitamos se o status já saiu de AGUARDANDO_ANALISE para
 *        algum estado terminal.
 *      - cancelada/encerrada.
 *   2. Resolve farmacêutico (UUID enviado OU prestador do usuário logado).
 *   3. INSERT em `analises_farmaceuticas` com `status = outcome` (ou
 *      `APROVADA_RESSALVAS`) + parecer + ressalvas JSONB.
 *   4. UPDATE `prescricoes.status`:
 *        - `APROVADA`            → `ATIVA`
 *        - `APROVADA_RESSALVAS`  → `ATIVA` (front mostra ressalvas)
 *        - `RECUSADA`            → `RECUSADA_FARMACIA`
 *   5. Audit `prescricao.analisada` + emit evento (Fase 7 farmácia consome).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { AnalisarPrescricaoDto } from '../dto/analisar.dto';
import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { presentPrescricao } from './prescricao.presenter';

const STATUS_TERMINAL = new Set([
  'CANCELADA',
  'ENCERRADA',
  'RECUSADA_FARMACIA',
]);

@Injectable()
export class AnalisarPrescricaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrescricoesRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: AnalisarPrescricaoDto,
  ): Promise<PrescricaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AnalisarPrescricaoUseCase requires a request context.');
    }

    const presc = await this.repo.findPrescricaoByUuid(uuid);
    if (presc === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_NOT_FOUND',
        message: 'Prescrição não encontrada.',
      });
    }
    if (STATUS_TERMINAL.has(presc.status)) {
      throw new ConflictException({
        code: 'PRESCRICAO_STATUS_INVALIDO',
        message: `Não é possível analisar prescrição com status ${presc.status}.`,
      });
    }

    let farmaceuticoId: bigint | null = null;
    if (dto.farmaceuticoUuid !== undefined) {
      farmaceuticoId = await this.repo.findPrestadorIdByUuid(dto.farmaceuticoUuid);
      if (farmaceuticoId === null) {
        throw new NotFoundException({
          code: 'FARMACEUTICO_NOT_FOUND',
          message: 'Farmacêutico não encontrado.',
        });
      }
    } else {
      farmaceuticoId = await this.repo.findPrestadorIdByUserId(ctx.userId);
      if (farmaceuticoId === null) {
        throw new UnprocessableEntityException({
          code: 'USUARIO_SEM_PRESTADOR',
          message:
            'Usuário não está vinculado a um cadastro de prestador (farmacêutico).',
        });
      }
    }

    // Determina novo status do cabeçalho.
    const novoStatus =
      dto.outcome === 'RECUSADA' ? 'RECUSADA_FARMACIA' : 'ATIVA';

    const tx = this.prisma.tx();

    const ressalvasJson =
      dto.outcome === 'APROVADA_RESSALVAS' && Array.isArray(dto.ressalvas)
        ? dto.ressalvas.map((r) => ({
            itemUuid: r.itemUuid,
            observacao: r.observacao,
          }))
        : null;

    const parecerFinal =
      dto.outcome === 'RECUSADA' ? dto.parecer ?? null : dto.parecerLivre ?? null;

    const inserted = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO analises_farmaceuticas (
        tenant_id, prescricao_id, prescricao_data_hora,
        farmaceutico_id, status, parecer, ressalvas, created_by
      ) VALUES (
        ${ctx.tenantId}::bigint,
        ${presc.id}::bigint,
        ${presc.data_hora}::timestamptz,
        ${farmaceuticoId}::bigint,
        ${dto.outcome}::enum_analise_farmaceutica_status,
        ${parecerFinal},
        ${ressalvasJson === null ? null : JSON.stringify(ressalvasJson)}::jsonb,
        ${ctx.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    const analise = inserted[0];

    await tx.$executeRaw`
      UPDATE prescricoes
         SET status     = ${novoStatus}::enum_prescricao_status,
             updated_at = now()
       WHERE id = ${presc.id}::bigint
         AND data_hora = ${presc.data_hora}::timestamptz
    `;

    await this.auditoria.record({
      tabela: 'prescricoes',
      registroId: presc.id,
      operacao: 'U',
      diff: {
        evento: 'prescricao.analisada',
        analise_id: analise.id.toString(),
        outcome: dto.outcome,
        novo_status: novoStatus,
        n_ressalvas: ressalvasJson?.length ?? 0,
      },
      finalidade: 'prescricao.analisada',
    });

    this.events.emit('prescricao.analisada', {
      prescricaoUuid: presc.uuid_externo,
      atendimentoUuid: presc.atendimento_uuid,
      pacienteUuid: presc.paciente_uuid,
      outcome: dto.outcome,
      novoStatus,
    });

    const updated = await this.repo.findPrescricaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Prescrição analisada não encontrada (RLS?).');
    }
    const itens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(updated, itens);
  }
}
