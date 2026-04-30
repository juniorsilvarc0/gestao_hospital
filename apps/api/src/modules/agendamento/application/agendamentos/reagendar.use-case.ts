/**
 * `PATCH /v1/agendamentos/:uuid` — reagendamento (Trilha A).
 *
 * Cria NOVO agendamento e marca o original como REAGENDADO.
 *   - Aceita troca de recurso (`recursoUuid` opcional).
 *   - O novo agendamento é submetido ao mesmo EXCLUDE constraint
 *     (RN-AGE-01) — se conflito, 409.
 *   - O original passa a `status = REAGENDADO`, com `reagendado_para_id`
 *     apontando para o novo. Tudo em uma transação (atômico).
 *
 * Atualizações leves (só `procedimentoUuid`/`observacao` sem mexer em
 * tempo/recurso) NÃO disparam REAGENDADO — fazemos UPDATE in-place.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateAgendamentoDto } from '../../dto/update-agendamento.dto';
import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import {
  isOverbookingError,
  OverbookingError,
} from '../../infrastructure/overbooking-error';
import { presentAgendamento } from './agendamento.presenter';

@Injectable()
export class ReagendarUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateAgendamentoDto,
  ): Promise<AgendamentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ReagendarUseCase requires a request context.');
    }

    const original = await this.repo.findAgendamentoByUuid(uuid);
    if (original === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }
    if (
      original.status !== 'AGENDADO' &&
      original.status !== 'CONFIRMADO'
    ) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_STATUS_INVALIDO',
        message: `Não é possível reagendar com status ${original.status}.`,
      });
    }

    const tx = this.prisma.tx();
    const trocaTempo =
      dto.inicio !== undefined || dto.fim !== undefined;
    const trocaRecurso = dto.recursoUuid !== undefined;

    if (!trocaTempo && !trocaRecurso) {
      // Update in-place (sem reagendamento).
      const sets: Prisma.Sql[] = [];
      if (dto.observacao !== undefined) {
        sets.push(Prisma.sql`observacao = ${dto.observacao}`);
      }
      if (dto.procedimentoUuid !== undefined) {
        const rows = await tx.$queryRaw<{ id: bigint }[]>`
          SELECT id FROM tabelas_procedimentos
           WHERE uuid_externo = ${dto.procedimentoUuid}::uuid
             AND deleted_at IS NULL LIMIT 1
        `;
        if (rows.length === 0) {
          throw new NotFoundException({
            code: 'PROCEDIMENTO_NOT_FOUND',
            message: 'Procedimento não encontrado.',
          });
        }
        sets.push(Prisma.sql`procedimento_id = ${rows[0].id}::bigint`);
      }
      if (dto.convenioUuid !== undefined) {
        const rows = await tx.$queryRaw<{ id: bigint }[]>`
          SELECT id FROM convenios
           WHERE uuid_externo = ${dto.convenioUuid}::uuid
             AND deleted_at IS NULL LIMIT 1
        `;
        if (rows.length === 0) {
          throw new NotFoundException({ code: 'CONVENIO_NOT_FOUND' });
        }
        sets.push(Prisma.sql`convenio_id = ${rows[0].id}::bigint`);
      }
      if (dto.planoUuid !== undefined) {
        const rows = await tx.$queryRaw<{ id: bigint }[]>`
          SELECT id FROM planos
           WHERE uuid_externo = ${dto.planoUuid}::uuid
             AND deleted_at IS NULL LIMIT 1
        `;
        if (rows.length === 0) {
          throw new NotFoundException({ code: 'PLANO_NOT_FOUND' });
        }
        sets.push(Prisma.sql`plano_id = ${rows[0].id}::bigint`);
      }
      if (sets.length === 0) {
        return presentAgendamento(original);
      }
      sets.push(Prisma.sql`updated_at = now()`);
      sets.push(Prisma.sql`updated_by = ${ctx.userId}::bigint`);
      sets.push(Prisma.sql`versao = versao + 1`);
      await tx.$executeRaw(
        Prisma.sql`UPDATE agendamentos SET ${Prisma.join(sets, ', ')}
                    WHERE id = ${original.id}::bigint`,
      );
      const updated = await this.repo.findAgendamentoByUuid(uuid);
      return presentAgendamento(updated ?? original);
    }

    // ───── Reagendamento: cria novo + marca original. ─────
    const inicioStr = dto.inicio ?? original.inicio.toISOString();
    const fimStr = dto.fim ?? original.fim.toISOString();
    const inicio = new Date(inicioStr);
    const fim = new Date(fimStr);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_DATAS_INVALIDAS',
        message: 'inicio/fim inválidos.',
      });
    }
    if (fim.getTime() <= inicio.getTime()) {
      throw new BadRequestException({
        code: 'AGENDAMENTO_PERIODO_INVALIDO',
        message: 'fim deve ser maior que inicio.',
      });
    }

    let novoRecursoId: bigint = original.recurso_id;
    if (trocaRecurso) {
      const id = await this.repo.findRecursoIdByUuid(dto.recursoUuid as string);
      if (id === null) {
        throw new NotFoundException({
          code: 'RECURSO_NOT_FOUND',
          message: 'Novo recurso não encontrado.',
        });
      }
      novoRecursoId = id;
    }

    let novoId: bigint;
    let novoUuid: string;
    try {
      // 1) INSERT novo agendamento — copia campos relevantes do original.
      const inserted = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
        INSERT INTO agendamentos (
          tenant_id, paciente_id, recurso_id, procedimento_id,
          inicio, fim, tipo, status, origem,
          encaixe, encaixe_motivo,
          convenio_id, plano_id,
          observacao, link_teleconsulta, teleconsulta_nonce,
          created_by
        )
        SELECT
          tenant_id, paciente_id, ${novoRecursoId}::bigint, procedimento_id,
          ${inicioStr}::timestamptz, ${fimStr}::timestamptz,
          tipo, 'AGENDADO'::enum_agendamento_status, origem,
          FALSE, NULL,
          convenio_id, plano_id,
          ${dto.observacao ?? null}, link_teleconsulta, teleconsulta_nonce,
          ${ctx.userId}::bigint
        FROM agendamentos WHERE id = ${original.id}::bigint
        RETURNING id, uuid_externo::text AS uuid_externo
      `;
      if (inserted.length === 0) {
        throw new Error('Falha ao inserir agendamento reagendado.');
      }
      novoId = inserted[0].id;
      novoUuid = inserted[0].uuid_externo;

      // 2) Marca original como REAGENDADO.
      await tx.$executeRaw`
        UPDATE agendamentos
           SET status = 'REAGENDADO'::enum_agendamento_status,
               reagendado_para_id = ${novoId}::bigint,
               updated_at = now(),
               updated_by = ${ctx.userId}::bigint,
               versao = versao + 1
         WHERE id = ${original.id}::bigint
      `;
    } catch (err: unknown) {
      if (isOverbookingError(err)) {
        throw new OverbookingError(
          'Já existe agendamento sobreposto no horário/recurso solicitado (RN-AGE-01).',
        );
      }
      throw err;
    }

    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: novoId,
      operacao: 'I',
      diff: {
        evento: 'agendamento.reagendado',
        agendamento_anterior_id: original.id.toString(),
        motivo: dto.motivo ?? null,
        novo_recurso_id: novoRecursoId.toString(),
        inicio: inicioStr,
        fim: fimStr,
      },
      finalidade: 'agendamento.reagendado',
    });

    const novo = await this.repo.findAgendamentoByUuid(novoUuid);
    if (novo === null) {
      throw new Error('Agendamento reagendado não encontrado.');
    }
    return presentAgendamento(novo);
  }
}
