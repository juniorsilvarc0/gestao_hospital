/**
 * `POST /v1/agendamentos` — coração da Trilha A.
 *
 * Fluxo:
 *   1. Resolve UUIDs (paciente, recurso, procedimento, convênio, plano).
 *   2. Valida `inicio < fim` e janela mínima 1 minuto.
 *   3. Se `encaixe.motivo` presente → marca encaixe = TRUE, valida via
 *      `ValidarEncaixeUseCase` (RN-AGE-06).
 *   4. INSERT direto. O EXCLUDE constraint `xc_agend_overlap` cuida do
 *      anti-overbooking (RN-AGE-01) — se Postgres devolver SQLSTATE
 *      `23P01` (exclusion_violation) → 409 Conflict (`AGENDAMENTO_CONFLITO`).
 *   5. Se `tipo = TELECONSULTA` → gera link único + nonce via
 *      `DailyCoService` (RN-AGE-05).
 *   6. Auditoria lógica:
 *      - `agendamento.criado` em todo caso;
 *      - `agendamento.encaixe.criado` quando encaixe = TRUE.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateAgendamentoDto } from '../../dto/create-agendamento.dto';
import type { AgendamentoResponse } from '../../dto/slot.response';
import { AgendamentoRepository } from '../../infrastructure/agendamento.repository';
import { DailyCoService } from '../../infrastructure/daily-co.service';
import {
  isOverbookingError,
  OverbookingError,
} from '../../infrastructure/overbooking-error';
import { ValidarEncaixeUseCase } from '../encaixe/validar-encaixe.use-case';
import { presentAgendamento } from './agendamento.presenter';

@Injectable()
export class CreateAgendamentoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AgendamentoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly daily: DailyCoService,
    private readonly encaixeValidator: ValidarEncaixeUseCase,
  ) {}

  async execute(dto: CreateAgendamentoDto): Promise<AgendamentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateAgendamentoUseCase requires a request context.');
    }

    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
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

    const recursoId = await this.repo.findRecursoIdByUuid(dto.recursoUuid);
    if (recursoId === null) {
      throw new NotFoundException({
        code: 'RECURSO_NOT_FOUND',
        message: 'Recurso não encontrado.',
      });
    }

    const meta = await this.repo.findRecursoMeta(recursoId);
    if (meta === null || !meta.ativo) {
      throw new NotFoundException({
        code: 'RECURSO_INATIVO',
        message: 'Recurso inativo ou inexistente.',
      });
    }

    const tx = this.prisma.tx();

    // Resolve paciente
    const pacienteRows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${dto.pacienteUuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    if (pacienteRows.length === 0) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }
    const pacienteId = pacienteRows[0].id;

    // Procedimento (opcional)
    let procedimentoId: bigint | null = null;
    if (dto.procedimentoUuid !== undefined) {
      const rows = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM tabelas_procedimentos
         WHERE uuid_externo = ${dto.procedimentoUuid}::uuid
           AND deleted_at IS NULL
         LIMIT 1
      `;
      if (rows.length === 0) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: 'Procedimento não encontrado.',
        });
      }
      procedimentoId = rows[0].id;
    }

    // Convênio/plano (opcionais)
    let convenioId: bigint | null = null;
    if (dto.convenioUuid !== undefined) {
      const rows = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM convenios
         WHERE uuid_externo = ${dto.convenioUuid}::uuid
           AND deleted_at IS NULL
         LIMIT 1
      `;
      if (rows.length === 0) {
        throw new NotFoundException({
          code: 'CONVENIO_NOT_FOUND',
          message: 'Convênio não encontrado.',
        });
      }
      convenioId = rows[0].id;
    }
    let planoId: bigint | null = null;
    if (dto.planoUuid !== undefined) {
      const rows = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM planos
         WHERE uuid_externo = ${dto.planoUuid}::uuid
           AND deleted_at IS NULL
         LIMIT 1
      `;
      if (rows.length === 0) {
        throw new NotFoundException({
          code: 'PLANO_NOT_FOUND',
          message: 'Plano não encontrado.',
        });
      }
      planoId = rows[0].id;
    }

    const isEncaixe = dto.encaixe === true;
    if (isEncaixe) {
      if (
        dto.encaixeMotivo === undefined ||
        dto.encaixeMotivo.trim().length < 5
      ) {
        throw new BadRequestException({
          code: 'AGENDAMENTO_ENCAIXE_MOTIVO_REQUIRED',
          message:
            'Encaixe exige motivo (mín. 5 caracteres). RN-AGE-06 / CHECK ck_agend_encaixe_motivo.',
        });
      }
      const diaIso = inicio.toISOString().slice(0, 10);
      await this.encaixeValidator.execute({
        recursoId,
        permiteEncaixe: meta.permiteEncaixe,
        encaixeMaxDia: meta.encaixeMaxDia,
        diaIso,
      });
    }

    const origem = dto.origem ?? 'INTERNO';

    // Teleconsulta — provisiona link/nonce ANTES do INSERT (precisa
    // entrar no INSERT). RN-AGE-05.
    let linkTele: string | null = null;
    let nonceTele: string | null = null;
    if (dto.tipo === 'TELECONSULTA') {
      const sala = await this.daily.criarSala({
        agendamentoUuid: 'pre-' + Date.now().toString(36),
        inicio,
        fim,
      });
      linkTele = sala.url;
      nonceTele = sala.nonce;
    }

    let row: { id: bigint; uuid_externo: string }[];
    try {
      row = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
        INSERT INTO agendamentos (
          tenant_id, paciente_id, recurso_id, procedimento_id,
          inicio, fim, tipo, status, origem,
          encaixe, encaixe_motivo,
          convenio_id, plano_id,
          observacao, link_teleconsulta, teleconsulta_nonce,
          created_by
        ) VALUES (
          ${ctx.tenantId}::bigint,
          ${pacienteId}::bigint,
          ${recursoId}::bigint,
          ${procedimentoId}::bigint,
          ${dto.inicio}::timestamptz,
          ${dto.fim}::timestamptz,
          ${dto.tipo}::enum_atendimento_tipo,
          'AGENDADO'::enum_agendamento_status,
          ${origem}::enum_agendamento_origem,
          ${isEncaixe},
          ${isEncaixe ? (dto.encaixeMotivo ?? null) : null},
          ${convenioId}::bigint,
          ${planoId}::bigint,
          ${dto.observacao ?? null},
          ${linkTele},
          ${nonceTele},
          ${ctx.userId}::bigint
        )
        RETURNING id, uuid_externo::text AS uuid_externo
      `;
    } catch (err: unknown) {
      if (isOverbookingError(err)) {
        throw new OverbookingError(
          'Recurso já tem agendamento conflitante no horário (RN-AGE-01). Use encaixe se aplicável.',
        );
      }
      throw err;
    }

    if (row.length === 0) {
      throw new Error('INSERT agendamentos não retornou linha.');
    }

    // Auditoria lógica.
    await this.auditoria.record({
      tabela: 'agendamentos',
      registroId: row[0].id,
      operacao: 'I',
      diff: {
        evento: isEncaixe ? 'agendamento.encaixe.criado' : 'agendamento.criado',
        recurso_id: recursoId.toString(),
        paciente_id: pacienteId.toString(),
        inicio: dto.inicio,
        fim: dto.fim,
        tipo: dto.tipo,
        ...(isEncaixe ? { encaixe_motivo: dto.encaixeMotivo } : {}),
      },
      finalidade: isEncaixe
        ? 'agendamento.encaixe.criado'
        : 'agendamento.criado',
    });

    const created = await this.repo.findAgendamentoByUuid(row[0].uuid_externo);
    if (created === null) {
      throw new Error('Agendamento criado não encontrado (RLS?)');
    }
    return presentAgendamento(created);
  }
}
