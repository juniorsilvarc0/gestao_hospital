/**
 * `SameRepository` — fonte única de SQL para SAME (prontuários físicos
 * e empréstimos).
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { EmprestimoStatus } from '../domain/emprestimo';
import type { ProntuarioStatus } from '../domain/prontuario';

export interface ProntuarioRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  paciente_id: bigint;
  numero_pasta: string;
  localizacao: string | null;
  status: ProntuarioStatus;
  digitalizado: boolean;
  pdf_legado_url: string | null;
  data_digitalizacao: Date | null;
  digitalizado_por: bigint | null;
  observacao: string | null;
  created_at: Date;
  created_by: bigint | null;
  updated_at: Date | null;
  // Joins
  paciente_uuid: string;
  paciente_nome: string;
  digitalizado_por_uuid: string | null;
}

export interface EmprestimoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  prontuario_id: bigint;
  solicitante_id: bigint;
  data_emprestimo: Date;
  data_devolucao_prevista: Date;
  data_devolucao_real: Date | null;
  motivo: string;
  status: EmprestimoStatus;
  observacao: string | null;
  created_at: Date;
  // Joins
  prontuario_uuid: string;
  numero_pasta: string;
  paciente_uuid: string;
  paciente_nome: string;
  solicitante_uuid: string;
  solicitante_nome: string;
}

@Injectable()
export class SameRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

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

  // ────────── Prontuários ──────────

  async insertProntuario(args: {
    tenantId: bigint;
    pacienteId: bigint;
    numeroPasta: string;
    localizacao: string | null;
    observacao: string | null;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO same_prontuarios (
        tenant_id, paciente_id, numero_pasta, localizacao,
        status, digitalizado, observacao, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.pacienteId}::bigint,
        ${args.numeroPasta},
        ${args.localizacao},
        'ARQUIVADO'::enum_same_prontuario_status,
        FALSE,
        ${args.observacao},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT same_prontuarios não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateProntuario(args: {
    id: bigint;
    numeroPasta?: string;
    localizacao?: string | null;
    observacao?: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE same_prontuarios
         SET numero_pasta = COALESCE(${args.numeroPasta ?? null}, numero_pasta),
             localizacao  = CASE WHEN ${args.localizacao === undefined}::bool
                                 THEN localizacao
                                 ELSE ${args.localizacao ?? null} END,
             observacao   = CASE WHEN ${args.observacao === undefined}::bool
                                 THEN observacao
                                 ELSE ${args.observacao ?? null} END,
             updated_at   = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateProntuarioStatus(args: {
    id: bigint;
    status: ProntuarioStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE same_prontuarios
         SET status     = ${args.status}::enum_same_prontuario_status,
             updated_at = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateProntuarioDigitalizacao(args: {
    id: bigint;
    pdfLegadoUrl: string;
    digitalizadoPor: bigint;
    novoStatus: ProntuarioStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE same_prontuarios
         SET digitalizado       = TRUE,
             pdf_legado_url     = ${args.pdfLegadoUrl},
             data_digitalizacao = now(),
             digitalizado_por   = ${args.digitalizadoPor}::bigint,
             status             = ${args.novoStatus}::enum_same_prontuario_status,
             updated_at         = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async findProntuarioByUuid(uuid: string): Promise<ProntuarioRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ProntuarioRow[]>`
      SELECT sp.id,
             sp.uuid_externo::text AS uuid_externo,
             sp.tenant_id,
             sp.paciente_id,
             sp.numero_pasta,
             sp.localizacao,
             sp.status::text AS status,
             sp.digitalizado,
             sp.pdf_legado_url,
             sp.data_digitalizacao,
             sp.digitalizado_por,
             sp.observacao,
             sp.created_at,
             sp.created_by,
             sp.updated_at,
             p.uuid_externo::text AS paciente_uuid,
             p.nome               AS paciente_nome,
             u.uuid_externo::text AS digitalizado_por_uuid
        FROM same_prontuarios sp
        JOIN pacientes p     ON p.id = sp.paciente_id
        LEFT JOIN usuarios u ON u.id = sp.digitalizado_por
       WHERE sp.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findProntuarioById(id: bigint): Promise<ProntuarioRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ProntuarioRow[]>`
      SELECT sp.id,
             sp.uuid_externo::text AS uuid_externo,
             sp.tenant_id,
             sp.paciente_id,
             sp.numero_pasta,
             sp.localizacao,
             sp.status::text AS status,
             sp.digitalizado,
             sp.pdf_legado_url,
             sp.data_digitalizacao,
             sp.digitalizado_por,
             sp.observacao,
             sp.created_at,
             sp.created_by,
             sp.updated_at,
             p.uuid_externo::text AS paciente_uuid,
             p.nome               AS paciente_nome,
             u.uuid_externo::text AS digitalizado_por_uuid
        FROM same_prontuarios sp
        JOIN pacientes p     ON p.id = sp.paciente_id
        LEFT JOIN usuarios u ON u.id = sp.digitalizado_por
       WHERE sp.id = ${id}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listProntuarios(args: {
    pacienteId?: bigint;
    status?: ProntuarioStatus;
    digitalizado?: boolean;
    numeroPasta?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: ProntuarioRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const pacienteFilter = args.pacienteId ?? null;
    const statusFilter = args.status ?? null;
    const digitalizadoFilter =
      args.digitalizado === undefined ? null : args.digitalizado;
    const numeroPastaFilter = args.numeroPasta ?? null;

    const rows = await tx.$queryRaw<ProntuarioRow[]>`
      SELECT sp.id,
             sp.uuid_externo::text AS uuid_externo,
             sp.tenant_id,
             sp.paciente_id,
             sp.numero_pasta,
             sp.localizacao,
             sp.status::text AS status,
             sp.digitalizado,
             sp.pdf_legado_url,
             sp.data_digitalizacao,
             sp.digitalizado_por,
             sp.observacao,
             sp.created_at,
             sp.created_by,
             sp.updated_at,
             p.uuid_externo::text AS paciente_uuid,
             p.nome               AS paciente_nome,
             u.uuid_externo::text AS digitalizado_por_uuid
        FROM same_prontuarios sp
        JOIN pacientes p     ON p.id = sp.paciente_id
        LEFT JOIN usuarios u ON u.id = sp.digitalizado_por
       WHERE (${pacienteFilter}::bigint IS NULL
              OR sp.paciente_id = ${pacienteFilter}::bigint)
         AND (${statusFilter}::text IS NULL
              OR sp.status::text = ${statusFilter}::text)
         AND (${digitalizadoFilter}::bool IS NULL
              OR sp.digitalizado = ${digitalizadoFilter}::bool)
         AND (${numeroPastaFilter}::text IS NULL
              OR sp.numero_pasta = ${numeroPastaFilter}::text)
       ORDER BY sp.created_at DESC, sp.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totals = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM same_prontuarios sp
       WHERE (${pacienteFilter}::bigint IS NULL
              OR sp.paciente_id = ${pacienteFilter}::bigint)
         AND (${statusFilter}::text IS NULL
              OR sp.status::text = ${statusFilter}::text)
         AND (${digitalizadoFilter}::bool IS NULL
              OR sp.digitalizado = ${digitalizadoFilter}::bool)
         AND (${numeroPastaFilter}::text IS NULL
              OR sp.numero_pasta = ${numeroPastaFilter}::text)
    `;
    const total = totals.length === 0 ? 0 : Number(totals[0].total);
    return { rows, total };
  }

  // ────────── Empréstimos ──────────

  async insertEmprestimo(args: {
    tenantId: bigint;
    prontuarioId: bigint;
    solicitanteId: bigint;
    motivo: string;
    dataDevolucaoPrevista: string; // YYYY-MM-DD
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO same_emprestimos (
        tenant_id, prontuario_id, solicitante_id,
        data_devolucao_prevista, motivo, status
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.prontuarioId}::bigint,
        ${args.solicitanteId}::bigint,
        ${args.dataDevolucaoPrevista}::date,
        ${args.motivo},
        'ATIVO'::enum_same_emprestimo_status
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT same_emprestimos não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateEmprestimoDevolucao(args: {
    id: bigint;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE same_emprestimos
         SET status              = 'DEVOLVIDO'::enum_same_emprestimo_status,
             data_devolucao_real = now(),
             observacao          = COALESCE(${args.observacao}, observacao)
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateEmprestimoStatus(args: {
    id: bigint;
    status: EmprestimoStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE same_emprestimos
         SET status = ${args.status}::enum_same_emprestimo_status
       WHERE id = ${args.id}::bigint
    `;
  }

  async findEmprestimoByUuid(uuid: string): Promise<EmprestimoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EmprestimoRow[]>`
      SELECT se.id,
             se.uuid_externo::text AS uuid_externo,
             se.tenant_id,
             se.prontuario_id,
             se.solicitante_id,
             se.data_emprestimo,
             se.data_devolucao_prevista,
             se.data_devolucao_real,
             se.motivo,
             se.status::text AS status,
             se.observacao,
             se.created_at,
             sp.uuid_externo::text AS prontuario_uuid,
             sp.numero_pasta,
             p.uuid_externo::text  AS paciente_uuid,
             p.nome                AS paciente_nome,
             u.uuid_externo::text  AS solicitante_uuid,
             u.nome                AS solicitante_nome
        FROM same_emprestimos se
        JOIN same_prontuarios sp ON sp.id = se.prontuario_id
        JOIN pacientes p         ON p.id  = sp.paciente_id
        JOIN usuarios u          ON u.id  = se.solicitante_id
       WHERE se.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listEmprestimos(args: {
    prontuarioId?: bigint;
    status?: EmprestimoStatus;
    apenasAtrasados?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ rows: EmprestimoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const prontuarioFilter = args.prontuarioId ?? null;
    const statusFilter = args.status ?? null;
    const atrasados =
      args.apenasAtrasados === undefined ? null : args.apenasAtrasados;

    const rows = await tx.$queryRaw<EmprestimoRow[]>`
      SELECT se.id,
             se.uuid_externo::text AS uuid_externo,
             se.tenant_id,
             se.prontuario_id,
             se.solicitante_id,
             se.data_emprestimo,
             se.data_devolucao_prevista,
             se.data_devolucao_real,
             se.motivo,
             se.status::text AS status,
             se.observacao,
             se.created_at,
             sp.uuid_externo::text AS prontuario_uuid,
             sp.numero_pasta,
             p.uuid_externo::text  AS paciente_uuid,
             p.nome                AS paciente_nome,
             u.uuid_externo::text  AS solicitante_uuid,
             u.nome                AS solicitante_nome
        FROM same_emprestimos se
        JOIN same_prontuarios sp ON sp.id = se.prontuario_id
        JOIN pacientes p         ON p.id  = sp.paciente_id
        JOIN usuarios u          ON u.id  = se.solicitante_id
       WHERE (${prontuarioFilter}::bigint IS NULL
              OR se.prontuario_id = ${prontuarioFilter}::bigint)
         AND (${statusFilter}::text IS NULL
              OR se.status::text = ${statusFilter}::text)
         AND (
           ${atrasados}::bool IS NULL
           OR (${atrasados}::bool = TRUE
               AND se.data_devolucao_real IS NULL
               AND se.data_devolucao_prevista < CURRENT_DATE)
           OR (${atrasados}::bool = FALSE
               AND (se.data_devolucao_real IS NOT NULL
                    OR se.data_devolucao_prevista >= CURRENT_DATE))
         )
       ORDER BY se.data_emprestimo DESC, se.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totals = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM same_emprestimos se
       WHERE (${prontuarioFilter}::bigint IS NULL
              OR se.prontuario_id = ${prontuarioFilter}::bigint)
         AND (${statusFilter}::text IS NULL
              OR se.status::text = ${statusFilter}::text)
         AND (
           ${atrasados}::bool IS NULL
           OR (${atrasados}::bool = TRUE
               AND se.data_devolucao_real IS NULL
               AND se.data_devolucao_prevista < CURRENT_DATE)
           OR (${atrasados}::bool = FALSE
               AND (se.data_devolucao_real IS NOT NULL
                    OR se.data_devolucao_prevista >= CURRENT_DATE))
         )
    `;
    const total = totals.length === 0 ? 0 : Number(totals[0].total);
    return { rows, total };
  }

  /**
   * Atualiza para `ATRASADO` os empréstimos `ATIVO` cujo
   * `data_devolucao_prevista < today`. Retorna IDs afetados.
   */
  async marcarAtrasadosBatch(): Promise<bigint[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      UPDATE same_emprestimos
         SET status = 'ATRASADO'::enum_same_emprestimo_status
       WHERE status = 'ATIVO'::enum_same_emprestimo_status
         AND data_devolucao_real IS NULL
         AND data_devolucao_prevista < CURRENT_DATE
      RETURNING id
    `;
    return rows.map((r) => r.id);
  }

  /**
   * Empréstimo ativo (ATIVO ou ATRASADO) mais recente para um
   * prontuário. Usado pelo `digitalizar` e `devolver` para identificar
   * qual estado restaurar.
   */
  async findEmprestimoAtivoByProntuario(
    prontuarioId: bigint,
  ): Promise<EmprestimoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EmprestimoRow[]>`
      SELECT se.id,
             se.uuid_externo::text AS uuid_externo,
             se.tenant_id,
             se.prontuario_id,
             se.solicitante_id,
             se.data_emprestimo,
             se.data_devolucao_prevista,
             se.data_devolucao_real,
             se.motivo,
             se.status::text AS status,
             se.observacao,
             se.created_at,
             sp.uuid_externo::text AS prontuario_uuid,
             sp.numero_pasta,
             p.uuid_externo::text  AS paciente_uuid,
             p.nome                AS paciente_nome,
             u.uuid_externo::text  AS solicitante_uuid,
             u.nome                AS solicitante_nome
        FROM same_emprestimos se
        JOIN same_prontuarios sp ON sp.id = se.prontuario_id
        JOIN pacientes p         ON p.id  = sp.paciente_id
        JOIN usuarios u          ON u.id  = se.solicitante_id
       WHERE se.prontuario_id = ${prontuarioId}::bigint
         AND se.status::text IN ('ATIVO', 'ATRASADO')
       ORDER BY se.data_emprestimo DESC
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }
}
