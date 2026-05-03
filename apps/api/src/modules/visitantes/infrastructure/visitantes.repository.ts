/**
 * `VisitantesRepository` — fonte única de SQL para visitantes/visitas.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` aplicou
 * `SET LOCAL app.current_tenant_id`. CPF nunca aparece em logs nem em
 * respostas — só os 4 últimos dígitos.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface VisitanteRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  nome: string;
  cpf_hash: string;
  cpf_ultimos4: string | null;
  documento_foto_url: string | null;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
  bloqueado_em: Date | null;
  bloqueado_por: bigint | null;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
  // Joins
  bloqueado_por_uuid: string | null;
}

export interface VisitaRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  visitante_id: bigint;
  paciente_id: bigint;
  atendimento_id: bigint | null;
  leito_id: bigint | null;
  setor_id: bigint | null;
  data_entrada: Date;
  data_saida: Date | null;
  porteiro_id: bigint | null;
  observacao: string | null;
  created_at: Date;
  // Joins
  visitante_uuid: string;
  visitante_nome: string;
  paciente_uuid: string;
  paciente_nome: string;
  leito_uuid: string | null;
  leito_codigo: string | null;
  setor_uuid: string | null;
  setor_nome: string | null;
  porteiro_uuid: string | null;
}

@Injectable()
export class VisitantesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Visitante CRUD ──────────

  async findVisitanteByCpfHash(
    cpfHash: string,
  ): Promise<VisitanteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<VisitanteRow[]>`
      SELECT v.id,
             v.uuid_externo::text AS uuid_externo,
             v.tenant_id, v.nome, v.cpf_hash, v.cpf_ultimos4,
             v.documento_foto_url, v.bloqueado, v.motivo_bloqueio,
             v.bloqueado_em, v.bloqueado_por, v.observacao,
             v.created_at, v.updated_at,
             u.uuid_externo::text AS bloqueado_por_uuid
        FROM visitantes v
        LEFT JOIN usuarios u ON u.id = v.bloqueado_por
       WHERE v.cpf_hash = ${cpfHash}
         AND v.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findVisitanteByUuid(uuid: string): Promise<VisitanteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<VisitanteRow[]>`
      SELECT v.id,
             v.uuid_externo::text AS uuid_externo,
             v.tenant_id, v.nome, v.cpf_hash, v.cpf_ultimos4,
             v.documento_foto_url, v.bloqueado, v.motivo_bloqueio,
             v.bloqueado_em, v.bloqueado_por, v.observacao,
             v.created_at, v.updated_at,
             u.uuid_externo::text AS bloqueado_por_uuid
        FROM visitantes v
        LEFT JOIN usuarios u ON u.id = v.bloqueado_por
       WHERE v.uuid_externo = ${uuid}::uuid
         AND v.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async insertVisitante(args: {
    tenantId: bigint;
    nome: string;
    cpfHash: string;
    cpfUltimos4: string;
    documentoFotoUrl: string | null;
    observacao: string | null;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO visitantes (
        tenant_id, nome, cpf_hash, cpf_ultimos4,
        documento_foto_url, bloqueado, observacao, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.nome},
        ${args.cpfHash},
        ${args.cpfUltimos4},
        ${args.documentoFotoUrl},
        FALSE,
        ${args.observacao},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT visitantes não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateVisitante(args: {
    id: bigint;
    nome?: string;
    documentoFotoUrl?: string | null;
    observacao?: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE visitantes
         SET nome = COALESCE(${args.nome ?? null}, nome),
             documento_foto_url = CASE WHEN ${args.documentoFotoUrl === undefined}::bool
                                       THEN documento_foto_url
                                       ELSE ${args.documentoFotoUrl ?? null} END,
             observacao = CASE WHEN ${args.observacao === undefined}::bool
                                THEN observacao
                                ELSE ${args.observacao ?? null} END,
             updated_at = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async bloquearVisitante(args: {
    id: bigint;
    motivo: string;
    userId: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE visitantes
         SET bloqueado       = TRUE,
             motivo_bloqueio = ${args.motivo},
             bloqueado_em    = now(),
             bloqueado_por   = ${args.userId}::bigint,
             updated_at      = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async desbloquearVisitante(args: { id: bigint }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE visitantes
         SET bloqueado       = FALSE,
             motivo_bloqueio = NULL,
             bloqueado_em    = NULL,
             bloqueado_por   = NULL,
             updated_at      = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async listVisitantes(args: {
    nome?: string;
    bloqueado?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ rows: VisitanteRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const nomeFilter = args.nome ? `%${args.nome.toLowerCase()}%` : null;
    const bloqFilter =
      args.bloqueado === undefined ? null : args.bloqueado;

    const rows = await tx.$queryRaw<VisitanteRow[]>`
      SELECT v.id,
             v.uuid_externo::text AS uuid_externo,
             v.tenant_id, v.nome, v.cpf_hash, v.cpf_ultimos4,
             v.documento_foto_url, v.bloqueado, v.motivo_bloqueio,
             v.bloqueado_em, v.bloqueado_por, v.observacao,
             v.created_at, v.updated_at,
             u.uuid_externo::text AS bloqueado_por_uuid
        FROM visitantes v
        LEFT JOIN usuarios u ON u.id = v.bloqueado_por
       WHERE v.deleted_at IS NULL
         AND (${nomeFilter}::text IS NULL
              OR LOWER(v.nome) LIKE ${nomeFilter}::text)
         AND (${bloqFilter}::bool IS NULL OR v.bloqueado = ${bloqFilter}::bool)
       ORDER BY v.nome ASC, v.id ASC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totals = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM visitantes v
       WHERE v.deleted_at IS NULL
         AND (${nomeFilter}::text IS NULL
              OR LOWER(v.nome) LIKE ${nomeFilter}::text)
         AND (${bloqFilter}::bool IS NULL OR v.bloqueado = ${bloqFilter}::bool)
    `;
    return {
      rows,
      total: totals.length === 0 ? 0 : Number(totals[0].total),
    };
  }

  // ────────── Atendimento ativo (lookup) ──────────

  /**
   * Atendimento ativo do paciente — preferimos `INTERNADO`, mas aceitamos
   * `EM_ATENDIMENTO`/`EM_TRIAGEM`/`EM_ESPERA` como fallback (visita
   * ambulatorial). Devolve leito/setor para checagem RN-VIS-02.
   */
  async findAtendimentoAtivoDoPaciente(pacienteUuid: string): Promise<{
    atendimentoId: bigint;
    pacienteId: bigint;
    leitoId: bigint | null;
    setorId: bigint;
    setorTipo: string;
    leitoTipoAcomodacao: string | null;
    status: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        atendimento_id: bigint;
        paciente_id: bigint;
        leito_id: bigint | null;
        setor_id: bigint;
        setor_tipo: string;
        leito_tipo_acomodacao: string | null;
        status: string;
      }[]
    >`
      SELECT a.id   AS atendimento_id,
             a.paciente_id,
             a.leito_id,
             a.setor_id,
             s.tipo::text AS setor_tipo,
             l.tipo_acomodacao::text AS leito_tipo_acomodacao,
             a.status::text AS status
        FROM atendimentos a
        JOIN pacientes p ON p.id = a.paciente_id
        JOIN setores s   ON s.id = a.setor_id
        LEFT JOIN leitos l ON l.id = a.leito_id
       WHERE p.uuid_externo = ${pacienteUuid}::uuid
         AND a.deleted_at IS NULL
         AND a.status::text IN (
           'INTERNADO','EM_ATENDIMENTO','EM_TRIAGEM','EM_ESPERA'
         )
       ORDER BY
         CASE a.status::text
           WHEN 'INTERNADO'      THEN 1
           WHEN 'EM_ATENDIMENTO' THEN 2
           WHEN 'EM_TRIAGEM'     THEN 3
           WHEN 'EM_ESPERA'      THEN 4
         END ASC,
         a.data_hora_entrada DESC
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      atendimentoId: rows[0].atendimento_id,
      pacienteId: rows[0].paciente_id,
      leitoId: rows[0].leito_id,
      setorId: rows[0].setor_id,
      setorTipo: rows[0].setor_tipo,
      leitoTipoAcomodacao: rows[0].leito_tipo_acomodacao,
      status: rows[0].status,
    };
  }

  /**
   * Conta visitas ativas (sem `data_saida`) em um leito específico.
   */
  async countVisitasAtivasNoLeito(leitoId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM visitas
       WHERE leito_id = ${leitoId}::bigint
         AND data_saida IS NULL
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  async findLeitoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM leitos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findLeitoByUuid(uuid: string): Promise<{
    id: bigint;
    tipoAcomodacao: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; tipo_acomodacao: string }[]
    >`
      SELECT id, tipo_acomodacao::text AS tipo_acomodacao
        FROM leitos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, tipoAcomodacao: rows[0].tipo_acomodacao };
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

  // ────────── Visitas ──────────

  async insertVisita(args: {
    tenantId: bigint;
    visitanteId: bigint;
    pacienteId: bigint;
    atendimentoId: bigint | null;
    leitoId: bigint | null;
    setorId: bigint | null;
    porteiroId: bigint;
    observacao: string | null;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO visitas (
        tenant_id, visitante_id, paciente_id,
        atendimento_id, leito_id, setor_id,
        porteiro_id, observacao
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.visitanteId}::bigint,
        ${args.pacienteId}::bigint,
        ${args.atendimentoId}::bigint,
        ${args.leitoId}::bigint,
        ${args.setorId}::bigint,
        ${args.porteiroId}::bigint,
        ${args.observacao}
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT visitas não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateVisitaSaida(args: { id: bigint }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE visitas
         SET data_saida = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async findVisitaByUuid(uuid: string): Promise<VisitaRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<VisitaRow[]>`
      SELECT vi.id,
             vi.uuid_externo::text AS uuid_externo,
             vi.tenant_id, vi.visitante_id, vi.paciente_id,
             vi.atendimento_id, vi.leito_id, vi.setor_id,
             vi.data_entrada, vi.data_saida, vi.porteiro_id,
             vi.observacao, vi.created_at,
             v.uuid_externo::text AS visitante_uuid,
             v.nome               AS visitante_nome,
             p.uuid_externo::text AS paciente_uuid,
             p.nome               AS paciente_nome,
             l.uuid_externo::text AS leito_uuid,
             l.codigo             AS leito_codigo,
             s.uuid_externo::text AS setor_uuid,
             s.nome               AS setor_nome,
             u.uuid_externo::text AS porteiro_uuid
        FROM visitas vi
        JOIN visitantes v  ON v.id = vi.visitante_id
        JOIN pacientes p   ON p.id = vi.paciente_id
        LEFT JOIN leitos l   ON l.id = vi.leito_id
        LEFT JOIN setores s  ON s.id = vi.setor_id
        LEFT JOIN usuarios u ON u.id = vi.porteiro_id
       WHERE vi.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listVisitas(args: {
    visitanteId?: bigint;
    pacienteId?: bigint;
    leitoId?: bigint;
    apenasAtivas?: boolean;
    dataInicio?: string;
    dataFim?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: VisitaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const visitanteFilter = args.visitanteId ?? null;
    const pacienteFilter = args.pacienteId ?? null;
    const leitoFilter = args.leitoId ?? null;
    const ativasFilter =
      args.apenasAtivas === undefined ? null : args.apenasAtivas;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<VisitaRow[]>`
      SELECT vi.id,
             vi.uuid_externo::text AS uuid_externo,
             vi.tenant_id, vi.visitante_id, vi.paciente_id,
             vi.atendimento_id, vi.leito_id, vi.setor_id,
             vi.data_entrada, vi.data_saida, vi.porteiro_id,
             vi.observacao, vi.created_at,
             v.uuid_externo::text AS visitante_uuid,
             v.nome               AS visitante_nome,
             p.uuid_externo::text AS paciente_uuid,
             p.nome               AS paciente_nome,
             l.uuid_externo::text AS leito_uuid,
             l.codigo             AS leito_codigo,
             s.uuid_externo::text AS setor_uuid,
             s.nome               AS setor_nome,
             u.uuid_externo::text AS porteiro_uuid
        FROM visitas vi
        JOIN visitantes v  ON v.id = vi.visitante_id
        JOIN pacientes p   ON p.id = vi.paciente_id
        LEFT JOIN leitos l   ON l.id = vi.leito_id
        LEFT JOIN setores s  ON s.id = vi.setor_id
        LEFT JOIN usuarios u ON u.id = vi.porteiro_id
       WHERE (${visitanteFilter}::bigint IS NULL
              OR vi.visitante_id = ${visitanteFilter}::bigint)
         AND (${pacienteFilter}::bigint IS NULL
              OR vi.paciente_id = ${pacienteFilter}::bigint)
         AND (${leitoFilter}::bigint IS NULL
              OR vi.leito_id = ${leitoFilter}::bigint)
         AND (${ativasFilter}::bool IS NULL
              OR (${ativasFilter}::bool = TRUE  AND vi.data_saida IS NULL)
              OR (${ativasFilter}::bool = FALSE AND vi.data_saida IS NOT NULL))
         AND (${dInicio}::timestamptz IS NULL
              OR vi.data_entrada >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz IS NULL
              OR vi.data_entrada <= ${dFim}::timestamptz)
       ORDER BY vi.data_entrada DESC, vi.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totals = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM visitas vi
       WHERE (${visitanteFilter}::bigint IS NULL
              OR vi.visitante_id = ${visitanteFilter}::bigint)
         AND (${pacienteFilter}::bigint IS NULL
              OR vi.paciente_id = ${pacienteFilter}::bigint)
         AND (${leitoFilter}::bigint IS NULL
              OR vi.leito_id = ${leitoFilter}::bigint)
         AND (${ativasFilter}::bool IS NULL
              OR (${ativasFilter}::bool = TRUE  AND vi.data_saida IS NULL)
              OR (${ativasFilter}::bool = FALSE AND vi.data_saida IS NOT NULL))
         AND (${dInicio}::timestamptz IS NULL
              OR vi.data_entrada >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz IS NULL
              OR vi.data_entrada <= ${dFim}::timestamptz)
    `;
    return {
      rows,
      total: totals.length === 0 ? 0 : Number(totals[0].total),
    };
  }
}
