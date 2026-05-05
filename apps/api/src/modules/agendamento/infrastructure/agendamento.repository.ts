/**
 * `AgendamentoRepository` — fonte única de SQL do módulo agendamento.
 *
 * Por que repository explícito? Os recursos têm 3 FKs heterogêneas
 * (prestador, sala, equipamento) que viram UUIDs externos. Centralizar
 * os JOINs aqui mantém os use cases enxutos. Toda query usa
 * `prisma.tx()` — RLS aplica via `SET LOCAL app.current_tenant_id`
 * (TenantContextInterceptor).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  AgendamentoOcupadoRow,
  BloqueioRow,
  DisponibilidadeRow,
} from '../application/slots/slot.types';

export interface RecursoRow {
  id: bigint;
  uuid_externo: string;
  tipo: 'PRESTADOR' | 'SALA' | 'EQUIPAMENTO';
  prestador_id: bigint | null;
  sala_id: bigint | null;
  equipamento_id: bigint | null;
  intervalo_minutos: number;
  permite_encaixe: boolean;
  encaixe_max_dia: number;
  ativo: boolean;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
  prestador_uuid: string | null;
  sala_uuid: string | null;
  equipamento_uuid: string | null;
}

export interface RecursoMeta {
  id: bigint;
  intervaloMinutos: number;
  permiteEncaixe: boolean;
  encaixeMaxDia: number;
  ativo: boolean;
}

export interface AgendamentoRow {
  id: bigint;
  uuid_externo: string;
  paciente_id: bigint;
  paciente_uuid: string;
  recurso_id: bigint;
  recurso_uuid: string;
  procedimento_id: bigint | null;
  procedimento_uuid: string | null;
  inicio: Date;
  fim: Date;
  tipo:
    | 'CONSULTA'
    | 'EXAME'
    | 'INTERNACAO'
    | 'CIRURGIA'
    | 'PRONTO_ATENDIMENTO'
    | 'TELECONSULTA'
    | 'OBSERVACAO';
  status:
    | 'AGENDADO'
    | 'CONFIRMADO'
    | 'COMPARECEU'
    | 'FALTOU'
    | 'CANCELADO'
    | 'REAGENDADO';
  origem: 'INTERNO' | 'PORTAL' | 'TOTEM' | 'TELEFONE' | 'API';
  encaixe: boolean;
  encaixe_motivo: string | null;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  plano_id: bigint | null;
  plano_uuid: string | null;
  observacao: string | null;
  link_teleconsulta: string | null;
  confirmado_em: Date | null;
  confirmado_via: string | null;
  checkin_em: Date | null;
  no_show_marcado_em: Date | null;
  cancelado_em: Date | null;
  cancelamento_motivo: string | null;
  reagendado_para_id: bigint | null;
  reagendado_para_uuid: string | null;
  created_at: Date;
  updated_at: Date | null;
  versao: number;
}

export interface ListAgendamentosParams {
  page: number;
  pageSize: number;
  recursoId?: bigint;
  pacienteId?: bigint;
  /**
   * Faixa de tempo (overlap): retorna agendamentos cujo intervalo
   * `[inicio, fim)` intersecta `[range.inicio, range.fim)`. `range.inicio`
   * sozinho funciona como "fim >= inicio". `range.fim` sozinho como
   * "inicio < fim".
   */
  rangeInicio?: string;
  rangeFim?: string;
  status?: string[];
}

@Injectable()
export class AgendamentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────── Recursos ────────────────────────────

  async findRecursoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM agendas_recursos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findRecursoMeta(id: bigint): Promise<RecursoMeta | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        intervalo_minutos: number;
        permite_encaixe: boolean;
        encaixe_max_dia: number;
        ativo: boolean;
      }[]
    >`
      SELECT id, intervalo_minutos, permite_encaixe, encaixe_max_dia, ativo
        FROM agendas_recursos
       WHERE id = ${id}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      intervaloMinutos: r.intervalo_minutos,
      permiteEncaixe: r.permite_encaixe,
      encaixeMaxDia: r.encaixe_max_dia,
      ativo: r.ativo,
    };
  }

  async findRecursoByUuid(uuid: string): Promise<RecursoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<RecursoRow[]>`
      SELECT
        ar.id, ar.uuid_externo, ar.tipo,
        ar.prestador_id, ar.sala_id, ar.equipamento_id,
        ar.intervalo_minutos, ar.permite_encaixe, ar.encaixe_max_dia,
        ar.ativo, ar.observacao, ar.created_at, ar.updated_at,
        p.uuid_externo::text  AS prestador_uuid,
        s.uuid_externo::text  AS sala_uuid,
        e.uuid_externo::text  AS equipamento_uuid
      FROM agendas_recursos ar
      LEFT JOIN prestadores      p ON p.id = ar.prestador_id   AND p.deleted_at IS NULL
      LEFT JOIN salas_cirurgicas s ON s.id = ar.sala_id        AND s.deleted_at IS NULL
      LEFT JOIN equipamentos     e ON e.id = ar.equipamento_id AND e.deleted_at IS NULL
      WHERE ar.uuid_externo = ${uuid}::uuid
        AND ar.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listRecursos(params: {
    page: number;
    pageSize: number;
    tipo?: 'PRESTADOR' | 'SALA' | 'EQUIPAMENTO';
    prestadorId?: bigint;
    salaId?: bigint;
    equipamentoId?: bigint;
    ativo?: boolean;
  }): Promise<{ data: RecursoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`ar.deleted_at IS NULL`];

    if (params.tipo !== undefined) {
      where.push(
        Prisma.sql`ar.tipo = ${params.tipo}::enum_agenda_recurso_tipo`,
      );
    }
    if (params.prestadorId !== undefined) {
      where.push(Prisma.sql`ar.prestador_id = ${params.prestadorId}::bigint`);
    }
    if (params.salaId !== undefined) {
      where.push(Prisma.sql`ar.sala_id = ${params.salaId}::bigint`);
    }
    if (params.equipamentoId !== undefined) {
      where.push(Prisma.sql`ar.equipamento_id = ${params.equipamentoId}::bigint`);
    }
    if (params.ativo !== undefined) {
      where.push(Prisma.sql`ar.ativo = ${params.ativo}`);
    }

    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM agendas_recursos ar WHERE ${whereClause}`,
      ),
      tx.$queryRaw<RecursoRow[]>(
        Prisma.sql`
          SELECT
            ar.id, ar.uuid_externo, ar.tipo,
            ar.prestador_id, ar.sala_id, ar.equipamento_id,
            ar.intervalo_minutos, ar.permite_encaixe, ar.encaixe_max_dia,
            ar.ativo, ar.observacao, ar.created_at, ar.updated_at,
            p.uuid_externo::text  AS prestador_uuid,
            s.uuid_externo::text  AS sala_uuid,
            e.uuid_externo::text  AS equipamento_uuid
          FROM agendas_recursos ar
          LEFT JOIN prestadores      p ON p.id = ar.prestador_id   AND p.deleted_at IS NULL
          LEFT JOIN salas_cirurgicas s ON s.id = ar.sala_id        AND s.deleted_at IS NULL
          LEFT JOIN equipamentos     e ON e.id = ar.equipamento_id AND e.deleted_at IS NULL
          WHERE ${whereClause}
          ORDER BY ar.created_at DESC
          LIMIT ${params.pageSize} OFFSET ${offset}
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findSalaIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM salas_cirurgicas
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findProcedimentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM tabelas_procedimentos
       WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPlanoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM planos
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findEquipamentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM equipamentos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ─────────────────────────── Disponibilidade ─────────────────────

  async listDisponibilidadeRange(
    recursoId: bigint,
    inicio: Date,
    fim: Date,
  ): Promise<DisponibilidadeRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<DisponibilidadeRow[]>`
      SELECT dia_semana, data_especifica, hora_inicio, hora_fim,
             vigencia_inicio, vigencia_fim, ativa
        FROM agendas_disponibilidade
       WHERE recurso_id = ${recursoId}::bigint
         AND ativa = TRUE
         AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${fim}::date)
         AND (vigencia_fim    IS NULL OR vigencia_fim    >= ${inicio}::date)
    `;
  }

  async listDisponibilidadeRecurso(
    recursoId: bigint,
  ): Promise<
    Array<{
      id: bigint;
      dia_semana: number | null;
      data_especifica: Date | null;
      hora_inicio: Date;
      hora_fim: Date;
      vigencia_inicio: Date | null;
      vigencia_fim: Date | null;
      ativa: boolean;
    }>
  > {
    const tx = this.prisma.tx();
    return tx.$queryRaw`
      SELECT id, dia_semana, data_especifica, hora_inicio, hora_fim,
             vigencia_inicio, vigencia_fim, ativa
        FROM agendas_disponibilidade
       WHERE recurso_id = ${recursoId}::bigint
       ORDER BY dia_semana NULLS LAST, data_especifica NULLS LAST,
                hora_inicio
    `;
  }

  async listBloqueiosRange(
    recursoId: bigint,
    inicio: Date,
    fim: Date,
  ): Promise<BloqueioRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<BloqueioRow[]>`
      SELECT inicio, fim
        FROM agendas_bloqueios
       WHERE recurso_id = ${recursoId}::bigint
         AND inicio < ${fim}::timestamptz
         AND fim    > ${inicio}::timestamptz
    `;
  }

  async listAgendamentosOcupados(
    recursoId: bigint,
    inicio: Date,
    fim: Date,
  ): Promise<AgendamentoOcupadoRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<AgendamentoOcupadoRow[]>`
      SELECT inicio, fim
        FROM agendamentos
       WHERE recurso_id = ${recursoId}::bigint
         AND status NOT IN ('CANCELADO', 'REAGENDADO')
         AND encaixe = FALSE
         AND inicio < ${fim}::timestamptz
         AND fim    > ${inicio}::timestamptz
    `;
  }

  // ─────────────────────────── Bloqueios ───────────────────────────

  async insertBloqueio(input: {
    tenantId: bigint;
    recursoId: bigint;
    inicio: string;
    fim: string;
    motivo: string | null;
    criadoPor: bigint;
  }): Promise<{ id: bigint }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      INSERT INTO agendas_bloqueios
        (tenant_id, recurso_id, inicio, fim, motivo, criado_por)
      VALUES
        (${input.tenantId}::bigint, ${input.recursoId}::bigint,
         ${input.inicio}::timestamptz, ${input.fim}::timestamptz,
         ${input.motivo}, ${input.criadoPor}::bigint)
      RETURNING id
    `;
    return { id: rows[0].id };
  }

  async deleteBloqueioById(id: bigint): Promise<boolean> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      DELETE FROM agendas_bloqueios WHERE id = ${id}::bigint RETURNING id
    `;
    return rows.length > 0;
  }

  async listBloqueiosRecurso(
    recursoId: bigint,
    limit: number,
  ): Promise<
    Array<{
      id: bigint;
      inicio: Date;
      fim: Date;
      motivo: string | null;
      criado_por: bigint | null;
      created_at: Date;
    }>
  > {
    const tx = this.prisma.tx();
    return tx.$queryRaw`
      SELECT id, inicio, fim, motivo, criado_por, created_at
        FROM agendas_bloqueios
       WHERE recurso_id = ${recursoId}::bigint
       ORDER BY inicio DESC
       LIMIT ${limit}::int
    `;
  }

  async findBloqueioIdByExternalId(
    externalId: string,
  ): Promise<bigint | null> {
    const tx = this.prisma.tx();
    // não há uuid_externo em agendas_bloqueios — usamos o id BIGINT
    // exposto como string. Aqui validamos formato e lookup.
    const idNum = Number(externalId);
    if (!Number.isInteger(idNum) || idNum <= 0) return null;
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM agendas_bloqueios WHERE id = ${idNum}::bigint LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ─────────────────────────── Agendamentos ────────────────────────

  async findAgendamentoByUuid(uuid: string): Promise<AgendamentoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<AgendamentoRow[]>`
      SELECT
        a.id, a.uuid_externo, a.paciente_id, p.uuid_externo::text AS paciente_uuid,
        a.recurso_id, ar.uuid_externo::text AS recurso_uuid,
        a.procedimento_id, tp.uuid_externo::text AS procedimento_uuid,
        a.inicio, a.fim, a.tipo, a.status, a.origem,
        a.encaixe, a.encaixe_motivo,
        a.convenio_id, c.uuid_externo::text AS convenio_uuid,
        a.plano_id, pl.uuid_externo::text   AS plano_uuid,
        a.observacao, a.link_teleconsulta,
        a.confirmado_em, a.confirmado_via,
        a.checkin_em, a.no_show_marcado_em,
        a.cancelado_em, a.cancelamento_motivo,
        a.reagendado_para_id, ra.uuid_externo::text AS reagendado_para_uuid,
        a.created_at, a.updated_at, a.versao
      FROM agendamentos a
      JOIN pacientes p           ON p.id  = a.paciente_id
      JOIN agendas_recursos ar   ON ar.id = a.recurso_id
      LEFT JOIN tabelas_procedimentos tp ON tp.id = a.procedimento_id
      LEFT JOIN convenios c              ON c.id  = a.convenio_id
      LEFT JOIN planos    pl             ON pl.id = a.plano_id
      LEFT JOIN agendamentos ra          ON ra.id = a.reagendado_para_id
      WHERE a.uuid_externo = ${uuid}::uuid
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listAgendamentos(
    params: ListAgendamentosParams,
  ): Promise<{ data: AgendamentoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (params.recursoId !== undefined) {
      where.push(Prisma.sql`a.recurso_id = ${params.recursoId}::bigint`);
    }
    if (params.pacienteId !== undefined) {
      where.push(Prisma.sql`a.paciente_id = ${params.pacienteId}::bigint`);
    }
    if (params.rangeInicio !== undefined) {
      where.push(Prisma.sql`a.fim > ${params.rangeInicio}::timestamptz`);
    }
    if (params.rangeFim !== undefined) {
      where.push(Prisma.sql`a.inicio < ${params.rangeFim}::timestamptz`);
    }
    if (params.status !== undefined && params.status.length > 0) {
      // Compose a literal IN list — values are validated by DTO IsEnum.
      const sanitized = params.status.filter((s) => /^[A-Z_]+$/.test(s));
      const list = Prisma.join(
        sanitized.map((s) => Prisma.sql`${s}::enum_agendamento_status`),
        ', ',
      );
      where.push(Prisma.sql`a.status IN (${list})`);
    }

    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM agendamentos a WHERE ${whereClause}`,
      ),
      tx.$queryRaw<AgendamentoRow[]>(
        Prisma.sql`
          SELECT
            a.id, a.uuid_externo, a.paciente_id, p.uuid_externo::text AS paciente_uuid,
            a.recurso_id, ar.uuid_externo::text AS recurso_uuid,
            a.procedimento_id, tp.uuid_externo::text AS procedimento_uuid,
            a.inicio, a.fim, a.tipo, a.status, a.origem,
            a.encaixe, a.encaixe_motivo,
            a.convenio_id, c.uuid_externo::text AS convenio_uuid,
            a.plano_id, pl.uuid_externo::text   AS plano_uuid,
            a.observacao, a.link_teleconsulta,
            a.confirmado_em, a.confirmado_via,
            a.checkin_em, a.no_show_marcado_em,
            a.cancelado_em, a.cancelamento_motivo,
            a.reagendado_para_id, ra.uuid_externo::text AS reagendado_para_uuid,
            a.created_at, a.updated_at, a.versao
          FROM agendamentos a
          JOIN pacientes p           ON p.id  = a.paciente_id
          JOIN agendas_recursos ar   ON ar.id = a.recurso_id
          LEFT JOIN tabelas_procedimentos tp ON tp.id = a.procedimento_id
          LEFT JOIN convenios c              ON c.id  = a.convenio_id
          LEFT JOIN planos    pl             ON pl.id = a.plano_id
          LEFT JOIN agendamentos ra          ON ra.id = a.reagendado_para_id
          WHERE ${whereClause}
          ORDER BY a.inicio DESC, a.id DESC
          LIMIT ${params.pageSize} OFFSET ${offset}
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async countEncaixesNoDia(
    recursoId: bigint,
    diaIso: string,
  ): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS total
        FROM agendamentos
       WHERE recurso_id = ${recursoId}::bigint
         AND encaixe = TRUE
         AND status NOT IN ('CANCELADO', 'REAGENDADO')
         AND inicio >= ${diaIso}::date
         AND inicio < (${diaIso}::date + INTERVAL '1 day')
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  /**
   * Atualização in-place de campos "leves" do agendamento.
   * Usada quando PATCH não muda inicio/fim/recurso (sem reagendamento).
   */
  async updateAgendamentoLight(
    id: bigint,
    patch: {
      observacao?: string | null;
      procedimentoId?: bigint;
      convenioId?: bigint;
      planoId?: bigint;
      updatedBy: bigint;
    },
  ): Promise<void> {
    const tx = this.prisma.tx();
    const sets: Prisma.Sql[] = [
      Prisma.sql`updated_at = now()`,
      Prisma.sql`updated_by = ${patch.updatedBy}::bigint`,
      Prisma.sql`versao = versao + 1`,
    ];
    if (patch.observacao !== undefined) {
      sets.push(Prisma.sql`observacao = ${patch.observacao}`);
    }
    if (patch.procedimentoId !== undefined) {
      sets.push(
        Prisma.sql`procedimento_id = ${patch.procedimentoId}::bigint`,
      );
    }
    if (patch.convenioId !== undefined) {
      sets.push(Prisma.sql`convenio_id = ${patch.convenioId}::bigint`);
    }
    if (patch.planoId !== undefined) {
      sets.push(Prisma.sql`plano_id = ${patch.planoId}::bigint`);
    }
    await tx.$executeRaw(
      Prisma.sql`UPDATE agendamentos SET ${Prisma.join(sets, ', ')} WHERE id = ${id}::bigint`,
    );
  }

  /** Marca agendamento original como REAGENDADO + ponteiro para o novo. */
  async markAsReagendado(
    id: bigint,
    novoId: bigint,
    updatedBy: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE agendamentos
         SET status = 'REAGENDADO'::enum_agendamento_status,
             reagendado_para_id = ${novoId}::bigint,
             updated_at = now(),
             updated_by = ${updatedBy}::bigint,
             versao = versao + 1
       WHERE id = ${id}::bigint
    `;
  }
}
