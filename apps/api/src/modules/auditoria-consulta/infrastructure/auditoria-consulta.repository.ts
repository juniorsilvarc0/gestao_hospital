/**
 * `AuditoriaConsultaRepository` — fonte única de SQL do módulo de
 * consulta de auditoria.
 *
 * RLS: usamos `prisma.tx()` — `TenantContextInterceptor` aplicou
 * `SET LOCAL app.current_tenant_id` antes do handler. Para
 * `auditoria_eventos` e `acessos_prontuario`, RLS já filtra por tenant.
 * `audit_security_events` permite ver registros do tenant atual + os
 * cross-tenant (`tenant_id IS NULL`).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { AuditOperacao } from '../dto/list-eventos-query.dto';
import type {
  SecurityEventSeveridade,
  SecurityEventTipo,
} from '../dto/list-security-query.dto';

export interface AuditEventoRow {
  id: bigint;
  tabela: string;
  registro_id: bigint;
  operacao: AuditOperacao;
  diff: unknown;
  usuario_uuid: string | null;
  finalidade: string | null;
  correlation_id: string | null;
  ip: string | null;
  created_at: Date;
}

export interface AcessoRow {
  id: bigint;
  paciente_uuid: string;
  usuario_uuid: string;
  perfil: string;
  finalidade: string;
  modulo: string;
  ip: string | null;
  acessado_em: Date;
}

export interface SecurityEventRow {
  uuid_externo: string;
  tipo: SecurityEventTipo;
  severidade: SecurityEventSeveridade;
  usuario_uuid: string | null;
  alvo_usuario_uuid: string | null;
  ip_origem: string | null;
  user_agent: string | null;
  request_path: string | null;
  request_method: string | null;
  detalhes: unknown;
  created_at: Date;
}

export interface ListEventosArgs {
  tabela?: string;
  finalidade?: string;
  usuarioId?: bigint;
  operacao?: AuditOperacao;
  dataInicio?: string;
  dataFim?: string;
  page: number;
  pageSize: number;
}

export interface ListAcessosArgs {
  pacienteId?: bigint;
  usuarioId?: bigint;
  finalidade?: string;
  modulo?: string;
  dataInicio?: string;
  dataFim?: string;
  page: number;
  pageSize: number;
}

export interface ListSecurityArgs {
  tipo?: SecurityEventTipo;
  severidade?: SecurityEventSeveridade;
  dataInicio?: string;
  dataFim?: string;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditoriaConsultaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────── Lookups ───────────

  async findUserIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM usuarios
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ─────────── auditoria_eventos ───────────

  async listEventos(
    args: ListEventosArgs,
  ): Promise<{ rows: AuditEventoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const tabela = args.tabela ?? null;
    const finalidade = args.finalidade ?? null;
    const usuarioId = args.usuarioId ?? null;
    const operacao = args.operacao ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<AuditEventoRow[]>`
      SELECT a.id,
             a.tabela,
             a.registro_id,
             a.operacao::text AS operacao,
             a.diff,
             u.uuid_externo::text AS usuario_uuid,
             a.finalidade,
             a.correlation_id::text AS correlation_id,
             host(a.ip)             AS ip,
             a.created_at
        FROM auditoria_eventos a
        LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE (${tabela}::text IS NULL OR a.tabela = ${tabela}::text)
         AND (${finalidade}::text IS NULL OR a.finalidade = ${finalidade}::text)
         AND (${usuarioId}::bigint IS NULL OR a.usuario_id = ${usuarioId}::bigint)
         AND (${operacao}::text IS NULL OR a.operacao = ${operacao}::text)
         AND (${dInicio}::timestamptz IS NULL OR a.created_at >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR a.created_at <= ${dFim}::timestamptz)
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM auditoria_eventos a
       WHERE (${tabela}::text IS NULL OR a.tabela = ${tabela}::text)
         AND (${finalidade}::text IS NULL OR a.finalidade = ${finalidade}::text)
         AND (${usuarioId}::bigint IS NULL OR a.usuario_id = ${usuarioId}::bigint)
         AND (${operacao}::text IS NULL OR a.operacao = ${operacao}::text)
         AND (${dInicio}::timestamptz IS NULL OR a.created_at >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR a.created_at <= ${dFim}::timestamptz)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ─────────── acessos_prontuario ───────────

  async listAcessos(
    args: ListAcessosArgs,
  ): Promise<{ rows: AcessoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const pacienteId = args.pacienteId ?? null;
    const usuarioId = args.usuarioId ?? null;
    const finalidade = args.finalidade ?? null;
    const modulo = args.modulo ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<AcessoRow[]>`
      SELECT ap.id,
             p.uuid_externo::text AS paciente_uuid,
             u.uuid_externo::text AS usuario_uuid,
             ap.perfil,
             ap.finalidade,
             ap.modulo,
             host(ap.ip)          AS ip,
             ap.acessado_em
        FROM acessos_prontuario ap
        JOIN pacientes p ON p.id = ap.paciente_id
        JOIN usuarios  u ON u.id = ap.usuario_id
       WHERE (${pacienteId}::bigint IS NULL OR ap.paciente_id = ${pacienteId}::bigint)
         AND (${usuarioId}::bigint  IS NULL OR ap.usuario_id  = ${usuarioId}::bigint)
         AND (${finalidade}::text   IS NULL OR ap.finalidade  = ${finalidade}::text)
         AND (${modulo}::text       IS NULL OR ap.modulo      = ${modulo}::text)
         AND (${dInicio}::timestamptz IS NULL OR ap.acessado_em >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR ap.acessado_em <= ${dFim}::timestamptz)
       ORDER BY ap.acessado_em DESC, ap.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM acessos_prontuario ap
       WHERE (${pacienteId}::bigint IS NULL OR ap.paciente_id = ${pacienteId}::bigint)
         AND (${usuarioId}::bigint  IS NULL OR ap.usuario_id  = ${usuarioId}::bigint)
         AND (${finalidade}::text   IS NULL OR ap.finalidade  = ${finalidade}::text)
         AND (${modulo}::text       IS NULL OR ap.modulo      = ${modulo}::text)
         AND (${dInicio}::timestamptz IS NULL OR ap.acessado_em >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR ap.acessado_em <= ${dFim}::timestamptz)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ─────────── audit_security_events ───────────

  async listSecurityEvents(
    args: ListSecurityArgs,
  ): Promise<{ rows: SecurityEventRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const tipo = args.tipo ?? null;
    const severidade = args.severidade ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<SecurityEventRow[]>`
      SELECT s.uuid_externo::text AS uuid_externo,
             s.tipo::text         AS tipo,
             s.severidade::text   AS severidade,
             u.uuid_externo::text AS usuario_uuid,
             ua.uuid_externo::text AS alvo_usuario_uuid,
             host(s.ip_origem)    AS ip_origem,
             s.user_agent,
             s.request_path,
             s.request_method,
             s.detalhes,
             s.created_at
        FROM audit_security_events s
        LEFT JOIN usuarios u  ON u.id  = s.usuario_id
        LEFT JOIN usuarios ua ON ua.id = s.alvo_usuario_id
       WHERE (${tipo}::text IS NULL OR s.tipo::text = ${tipo}::text)
         AND (${severidade}::text IS NULL OR s.severidade::text = ${severidade}::text)
         AND (${dInicio}::timestamptz IS NULL OR s.created_at >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR s.created_at <= ${dFim}::timestamptz)
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM audit_security_events s
       WHERE (${tipo}::text IS NULL OR s.tipo::text = ${tipo}::text)
         AND (${severidade}::text IS NULL OR s.severidade::text = ${severidade}::text)
         AND (${dInicio}::timestamptz IS NULL OR s.created_at >= ${dInicio}::timestamptz)
         AND (${dFim}::timestamptz    IS NULL OR s.created_at <= ${dFim}::timestamptz)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }
}
