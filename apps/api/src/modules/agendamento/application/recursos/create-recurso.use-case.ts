/**
 * `POST /v1/agendas/recursos` — cria um recurso agendável.
 *
 * Coerência tipo × *Uuid:
 *   - tipo PRESTADOR  → exige `prestadorUuid` (XOR exato).
 *   - tipo SALA       → exige `salaUuid`.
 *   - tipo EQUIPAMENTO→ exige `equipamentoUuid`.
 * Outros UUIDs presentes ⇒ 422.
 *
 * Não há `uuid_externo` em `agendas_disponibilidade` / `agendas_bloqueios`
 * (DB.md §7.4) — esses são CRUDADOS via subrecursos do recurso pai.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import type { CreateRecursoDto } from '../../dto/create-recurso.dto';
import type { RecursoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { presentRecurso } from './recurso.presenter';

@Injectable()
export class CreateRecursoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
  ) {}

  async execute(dto: CreateRecursoDto): Promise<RecursoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateRecursoUseCase requires a request context.');
    }

    let prestadorId: bigint | null = null;
    let salaId: bigint | null = null;
    let equipamentoId: bigint | null = null;

    const presentes: string[] = [];
    if (dto.prestadorUuid !== undefined) presentes.push('prestadorUuid');
    if (dto.salaUuid !== undefined) presentes.push('salaUuid');
    if (dto.equipamentoUuid !== undefined) presentes.push('equipamentoUuid');

    if (presentes.length !== 1) {
      throw new BadRequestException({
        code: 'RECURSO_REFERENCE_AMBIGUOUS',
        message:
          'Informe exatamente UM dentre prestadorUuid, salaUuid, equipamentoUuid.',
      });
    }

    if (dto.tipo === 'PRESTADOR') {
      if (dto.prestadorUuid === undefined) {
        throw new BadRequestException({
          code: 'RECURSO_REFERENCE_MISMATCH',
          message: 'tipo=PRESTADOR exige prestadorUuid.',
        });
      }
      prestadorId = await this.repo.findPrestadorIdByUuid(dto.prestadorUuid);
      if (prestadorId === null) {
        throw new NotFoundException({
          code: 'PRESTADOR_NOT_FOUND',
          message: 'prestadorUuid não encontrado no tenant.',
        });
      }
    } else if (dto.tipo === 'SALA') {
      if (dto.salaUuid === undefined) {
        throw new BadRequestException({
          code: 'RECURSO_REFERENCE_MISMATCH',
          message: 'tipo=SALA exige salaUuid.',
        });
      }
      salaId = await this.repo.findSalaIdByUuid(dto.salaUuid);
      if (salaId === null) {
        throw new NotFoundException({
          code: 'SALA_NOT_FOUND',
          message: 'salaUuid não encontrada no tenant.',
        });
      }
    } else {
      if (dto.equipamentoUuid === undefined) {
        throw new BadRequestException({
          code: 'RECURSO_REFERENCE_MISMATCH',
          message: 'tipo=EQUIPAMENTO exige equipamentoUuid.',
        });
      }
      equipamentoId = await this.repo.findEquipamentoIdByUuid(
        dto.equipamentoUuid,
      );
      if (equipamentoId === null) {
        throw new NotFoundException({
          code: 'EQUIPAMENTO_NOT_FOUND',
          message: 'equipamentoUuid não encontrado no tenant.',
        });
      }
    }

    const tx = this.prisma.tx();
    const intervaloMinutos = dto.intervaloMinutos ?? 30;
    const permiteEncaixe = dto.permiteEncaixe ?? true;
    const encaixeMaxDia = dto.encaixeMaxDia ?? 2;

    const rows = await tx.$queryRaw<{ uuid_externo: string }[]>`
      INSERT INTO agendas_recursos (
        tenant_id, tipo,
        prestador_id, sala_id, equipamento_id,
        intervalo_minutos, permite_encaixe, encaixe_max_dia,
        observacao
      ) VALUES (
        ${ctx.tenantId}::bigint,
        ${dto.tipo}::enum_agenda_recurso_tipo,
        ${prestadorId}::bigint,
        ${salaId}::bigint,
        ${equipamentoId}::bigint,
        ${intervaloMinutos},
        ${permiteEncaixe},
        ${encaixeMaxDia},
        ${dto.observacao ?? null}
      )
      RETURNING uuid_externo::text AS uuid_externo
    `;

    const created = await this.repo.findRecursoByUuid(rows[0].uuid_externo);
    if (created === null) {
      throw new Error('Recurso criado não encontrado (RLS?)');
    }
    return presentRecurso(created);
  }
}
