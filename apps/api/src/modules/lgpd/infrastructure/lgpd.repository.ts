/**
 * `LgpdRepository` — fonte única de SQL do bounded context LGPD.
 *
 * Cobre as duas tabelas centrais do módulo:
 *   - `solicitacoes_lgpd`  (Art. 18 — direitos do titular)
 *   - `lgpd_exports`       (RN-LGP-04 — export FHIR/JSON com dual approval)
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` aplicou
 * `SET LOCAL app.current_tenant_id` antes do handler, então toda query
 * deste repositório fica naturalmente isolada por tenant.
 *
 * Convenção: o repositório recebe IDs/strings já validados pela camada
 * de aplicação. Inserts retornam `id`, `uuid_externo` e os timestamps
 * estritamente necessários pelo presenter — não trazemos a entidade
 * inteira numa segunda viagem. Updates retornam `count` para o caller
 * decidir se houve violação de pré-condição.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  LgpdExportFormato,
  LgpdExportStatus,
} from '../domain/export';
import type {
  LgpdSolicitacaoStatus,
  LgpdSolicitacaoTipo,
} from '../domain/solicitacao';

// ─────────── Solicitações ───────────

export interface SolicitacaoRow {
  id: bigint;
  uuid_externo: string;
  paciente_id: bigint;
  paciente_uuid: string;
  tipo: LgpdSolicitacaoTipo;
  status: LgpdSolicitacaoStatus;
  motivo: string | null;
  prazo_sla_dias: number;
  solicitada_em: Date;
  atendida_em: Date | null;
  resposta: string | null;
}

export interface InsertSolicitacaoArgs {
  tenantId: bigint;
  pacienteId: bigint;
  tipo: LgpdSolicitacaoTipo;
  motivo: string | null;
  /**
   * Estrutura livre validada pela camada de aplicação. Se presente, é
   * concatenada ao motivo entre colchetes (`solicitacoes_lgpd` não tem
   * coluna específica para metadados).
   */
  dadosAdicionais?: Record<string, unknown> | null;
  ipOrigem?: string | null;
  userAgent?: string | null;
  solicitanteId: bigint;
  prazoSlaDias?: number;
}

export interface ListSolicitacoesArgs {
  pacienteId?: bigint;
  tipo?: LgpdSolicitacaoTipo;
  status?: LgpdSolicitacaoStatus;
  page: number;
  pageSize: number;
}

// ─────────── Exports ───────────

export interface ExportRow {
  id: bigint;
  uuid_externo: string;
  paciente_id: bigint | null;
  paciente_uuid: string | null;
  solicitacao_lgpd_id: bigint | null;
  formato: LgpdExportFormato;
  status: LgpdExportStatus;
  motivo_solicitacao: string;
  solicitado_por_uuid: string | null;
  data_solicitacao: Date;
  aprovado_dpo_por_uuid: string | null;
  data_aprovacao_dpo: Date | null;
  aprovado_supervisor_por_uuid: string | null;
  data_aprovacao_sup: Date | null;
  rejeitado_por_uuid: string | null;
  data_rejeicao: Date | null;
  motivo_rejeicao: string | null;
  data_geracao: Date | null;
  arquivo_url: string | null;
  arquivo_hash_sha256: string | null;
  data_expiracao: Date | null;
  data_download: Date | null;
  ip_download: string | null;
  created_at: Date;
}

export interface InsertExportArgs {
  tenantId: bigint;
  pacienteId: bigint | null;
  solicitacaoLgpdId: bigint | null;
  formato: LgpdExportFormato;
  motivoSolicitacao: string;
  solicitadoPorId: bigint;
}

export interface ListExportsArgs {
  status?: LgpdExportStatus;
  pacienteId?: bigint;
  page: number;
  pageSize: number;
}

@Injectable()
export class LgpdRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────── Lookups ─────────────────

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ───────────────── Solicitações ─────────────────

  async insertSolicitacao(args: InsertSolicitacaoArgs): Promise<SolicitacaoRow> {
    const tx = this.prisma.tx();
    const motivoFinal = this.composeMotivo(args.motivo, {
      dadosAdicionais: args.dadosAdicionais ?? null,
      ipOrigem: args.ipOrigem ?? null,
      userAgent: args.userAgent ?? null,
    });
    const prazo = args.prazoSlaDias ?? 15;

    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        uuid_externo: string;
        paciente_uuid: string;
        tipo: LgpdSolicitacaoTipo;
        status: LgpdSolicitacaoStatus;
        motivo: string | null;
        prazo_sla_dias: number;
        solicitada_em: Date;
        atendida_em: Date | null;
        resposta: string | null;
      }>
    >`
      WITH ins AS (
        INSERT INTO solicitacoes_lgpd
          (tenant_id, paciente_id, tipo, motivo, status, solicitante_id, prazo_sla_dias)
        VALUES
          (${args.tenantId}::bigint,
           ${args.pacienteId}::bigint,
           ${args.tipo}::enum_lgpd_solicitacao_tipo,
           ${motivoFinal},
           'PENDENTE'::enum_lgpd_solicitacao_status,
           ${args.solicitanteId}::bigint,
           ${prazo}::int)
        RETURNING id, uuid_externo, paciente_id, tipo, status, motivo,
                  prazo_sla_dias, solicitada_em, atendida_em, resposta
      )
      SELECT ins.id,
             ins.uuid_externo::text                AS uuid_externo,
             p.uuid_externo::text                  AS paciente_uuid,
             ins.tipo::text                        AS tipo,
             ins.status::text                      AS status,
             ins.motivo,
             ins.prazo_sla_dias,
             ins.solicitada_em,
             ins.atendida_em,
             ins.resposta
        FROM ins
        JOIN pacientes p ON p.id = ins.paciente_id
    `;
    return {
      id: rows[0].id,
      uuid_externo: rows[0].uuid_externo,
      paciente_id: args.pacienteId,
      paciente_uuid: rows[0].paciente_uuid,
      tipo: rows[0].tipo,
      status: rows[0].status,
      motivo: rows[0].motivo,
      prazo_sla_dias: rows[0].prazo_sla_dias,
      solicitada_em: rows[0].solicitada_em,
      atendida_em: rows[0].atendida_em,
      resposta: rows[0].resposta,
    };
  }

  async findSolicitacaoByUuid(uuid: string): Promise<SolicitacaoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<SolicitacaoRow[]>`
      SELECT s.id,
             s.uuid_externo::text          AS uuid_externo,
             s.paciente_id,
             p.uuid_externo::text          AS paciente_uuid,
             s.tipo::text                  AS tipo,
             s.status::text                AS status,
             s.motivo,
             s.prazo_sla_dias,
             s.solicitada_em,
             s.atendida_em,
             s.resposta
        FROM solicitacoes_lgpd s
        JOIN pacientes p ON p.id = s.paciente_id
       WHERE s.uuid_externo = ${uuid}::uuid AND s.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listSolicitacoesByPaciente(
    pacienteId: bigint,
    page: number,
    pageSize: number,
  ): Promise<{ rows: SolicitacaoRow[]; total: number }> {
    return this.listSolicitacoesInternal({
      pacienteId,
      page,
      pageSize,
    });
  }

  async listSolicitacoes(
    args: ListSolicitacoesArgs,
  ): Promise<{ rows: SolicitacaoRow[]; total: number }> {
    return this.listSolicitacoesInternal(args);
  }

  private async listSolicitacoesInternal(
    args: ListSolicitacoesArgs,
  ): Promise<{ rows: SolicitacaoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const pacienteId = args.pacienteId ?? null;
    const tipo = args.tipo ?? null;
    const status = args.status ?? null;

    const rows = await tx.$queryRaw<SolicitacaoRow[]>`
      SELECT s.id,
             s.uuid_externo::text     AS uuid_externo,
             s.paciente_id,
             p.uuid_externo::text     AS paciente_uuid,
             s.tipo::text             AS tipo,
             s.status::text           AS status,
             s.motivo,
             s.prazo_sla_dias,
             s.solicitada_em,
             s.atendida_em,
             s.resposta
        FROM solicitacoes_lgpd s
        JOIN pacientes p ON p.id = s.paciente_id
       WHERE s.deleted_at IS NULL
         AND (${pacienteId}::bigint IS NULL OR s.paciente_id = ${pacienteId}::bigint)
         AND (${tipo}::text         IS NULL OR s.tipo::text  = ${tipo}::text)
         AND (${status}::text       IS NULL OR s.status::text = ${status}::text)
       ORDER BY s.solicitada_em DESC, s.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM solicitacoes_lgpd s
       WHERE s.deleted_at IS NULL
         AND (${pacienteId}::bigint IS NULL OR s.paciente_id = ${pacienteId}::bigint)
         AND (${tipo}::text         IS NULL OR s.tipo::text  = ${tipo}::text)
         AND (${status}::text       IS NULL OR s.status::text = ${status}::text)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ───────────────── Exports ─────────────────

  async insertExport(args: InsertExportArgs): Promise<ExportRow> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO lgpd_exports
        (tenant_id, paciente_id, solicitacao_lgpd_id, formato, status,
         solicitado_por, motivo_solicitacao)
      VALUES
        (${args.tenantId}::bigint,
         ${args.pacienteId}::bigint,
         ${args.solicitacaoLgpdId}::bigint,
         ${args.formato}::enum_lgpd_export_formato,
         'AGUARDANDO_APROVACAO_DPO'::enum_lgpd_export_status,
         ${args.solicitadoPorId}::bigint,
         ${args.motivoSolicitacao})
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    const inserted = await this.findExportByUuid(rows[0].uuid_externo);
    if (inserted === null) {
      throw new Error(
        `LgpdRepository.insertExport: export ${rows[0].uuid_externo} not visible after insert (RLS?).`,
      );
    }
    return inserted;
  }

  async findExportByUuid(uuid: string): Promise<ExportRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ExportRow[]>`
      SELECT e.id,
             e.uuid_externo::text                  AS uuid_externo,
             e.paciente_id,
             p.uuid_externo::text                  AS paciente_uuid,
             e.solicitacao_lgpd_id,
             e.formato::text                       AS formato,
             e.status::text                        AS status,
             e.motivo_solicitacao,
             us.uuid_externo::text                 AS solicitado_por_uuid,
             e.data_solicitacao,
             ud.uuid_externo::text                 AS aprovado_dpo_por_uuid,
             e.data_aprovacao_dpo,
             usp.uuid_externo::text                AS aprovado_supervisor_por_uuid,
             e.data_aprovacao_sup,
             ur.uuid_externo::text                 AS rejeitado_por_uuid,
             e.data_rejeicao,
             e.motivo_rejeicao,
             e.data_geracao,
             e.arquivo_url,
             e.arquivo_hash_sha256,
             e.data_expiracao,
             e.data_download,
             host(e.ip_download)                   AS ip_download,
             e.created_at
        FROM lgpd_exports e
        LEFT JOIN pacientes p  ON p.id  = e.paciente_id
        LEFT JOIN usuarios  us ON us.id = e.solicitado_por
        LEFT JOIN usuarios  ud ON ud.id = e.aprovado_dpo_por
        LEFT JOIN usuarios  usp ON usp.id = e.aprovado_supervisor_por
        LEFT JOIN usuarios  ur ON ur.id = e.rejeitado_por
       WHERE e.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listExports(
    args: ListExportsArgs,
  ): Promise<{ rows: ExportRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const status = args.status ?? null;
    const pacienteId = args.pacienteId ?? null;

    const rows = await tx.$queryRaw<ExportRow[]>`
      SELECT e.id,
             e.uuid_externo::text                  AS uuid_externo,
             e.paciente_id,
             p.uuid_externo::text                  AS paciente_uuid,
             e.solicitacao_lgpd_id,
             e.formato::text                       AS formato,
             e.status::text                        AS status,
             e.motivo_solicitacao,
             us.uuid_externo::text                 AS solicitado_por_uuid,
             e.data_solicitacao,
             ud.uuid_externo::text                 AS aprovado_dpo_por_uuid,
             e.data_aprovacao_dpo,
             usp.uuid_externo::text                AS aprovado_supervisor_por_uuid,
             e.data_aprovacao_sup,
             ur.uuid_externo::text                 AS rejeitado_por_uuid,
             e.data_rejeicao,
             e.motivo_rejeicao,
             e.data_geracao,
             e.arquivo_url,
             e.arquivo_hash_sha256,
             e.data_expiracao,
             e.data_download,
             host(e.ip_download)                   AS ip_download,
             e.created_at
        FROM lgpd_exports e
        LEFT JOIN pacientes p  ON p.id  = e.paciente_id
        LEFT JOIN usuarios  us ON us.id = e.solicitado_por
        LEFT JOIN usuarios  ud ON ud.id = e.aprovado_dpo_por
        LEFT JOIN usuarios  usp ON usp.id = e.aprovado_supervisor_por
        LEFT JOIN usuarios  ur ON ur.id = e.rejeitado_por
       WHERE (${status}::text     IS NULL OR e.status::text = ${status}::text)
         AND (${pacienteId}::bigint IS NULL OR e.paciente_id = ${pacienteId}::bigint)
       ORDER BY e.data_solicitacao DESC, e.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM lgpd_exports e
       WHERE (${status}::text     IS NULL OR e.status::text = ${status}::text)
         AND (${pacienteId}::bigint IS NULL OR e.paciente_id = ${pacienteId}::bigint)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  /**
   * Aprovação do DPO: status AGUARDANDO_APROVACAO_DPO → AGUARDANDO_APROVACAO_SUPERVISOR.
   * Devolve o número de linhas afetadas — a camada de aplicação interpreta
   * `0` como pré-condição falhada (status já mudou ou export inexistente).
   */
  async updateExportAprovarDpo(id: bigint, userId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status              = 'AGUARDANDO_APROVACAO_SUPERVISOR'::enum_lgpd_export_status,
             aprovado_dpo_por    = ${userId}::bigint,
             data_aprovacao_dpo  = now(),
             updated_at          = now()
       WHERE id = ${id}::bigint
         AND status = 'AGUARDANDO_APROVACAO_DPO'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  /**
   * Aprovação do Supervisor: AGUARDANDO_APROVACAO_SUPERVISOR → APROVADO.
   * O CHECK constraint `ck_lgpd_export_aprovadores_distintos` garante que
   * o supervisor é diferente do DPO; violação retorna PostgreSQL error
   * `23514` que a camada de aplicação traduz em 422.
   */
  async updateExportAprovarSupervisor(
    id: bigint,
    userId: bigint,
  ): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status                  = 'APROVADO'::enum_lgpd_export_status,
             aprovado_supervisor_por = ${userId}::bigint,
             data_aprovacao_sup      = now(),
             updated_at              = now()
       WHERE id = ${id}::bigint
         AND status = 'AGUARDANDO_APROVACAO_SUPERVISOR'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  async updateExportRejeitar(
    id: bigint,
    userId: bigint,
    motivo: string,
  ): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status          = 'REJEITADO'::enum_lgpd_export_status,
             rejeitado_por   = ${userId}::bigint,
             data_rejeicao   = now(),
             motivo_rejeicao = ${motivo},
             updated_at      = now()
       WHERE id = ${id}::bigint
         AND status IN (
           'AGUARDANDO_APROVACAO_DPO'::enum_lgpd_export_status,
           'AGUARDANDO_APROVACAO_SUPERVISOR'::enum_lgpd_export_status,
           'APROVADO'::enum_lgpd_export_status
         )
    `;
    return Number(result);
  }

  async updateExportGerando(id: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status     = 'GERANDO'::enum_lgpd_export_status,
             updated_at = now()
       WHERE id = ${id}::bigint
         AND status = 'APROVADO'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  async updateExportPronto(
    id: bigint,
    arquivoUrl: string,
    hashSha256: string,
    dataExpiracao: Date,
  ): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status              = 'PRONTO_PARA_DOWNLOAD'::enum_lgpd_export_status,
             arquivo_url         = ${arquivoUrl},
             arquivo_hash_sha256 = ${hashSha256},
             data_geracao        = now(),
             data_expiracao      = ${dataExpiracao}::timestamptz,
             updated_at          = now()
       WHERE id = ${id}::bigint
         AND status = 'GERANDO'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  async updateExportBaixado(id: bigint, ipDownload: string | null): Promise<number> {
    const tx = this.prisma.tx();
    const ip = ipDownload ?? null;
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status        = 'BAIXADO'::enum_lgpd_export_status,
             data_download = now(),
             ip_download   = ${ip}::inet,
             updated_at    = now()
       WHERE id = ${id}::bigint
         AND status = 'PRONTO_PARA_DOWNLOAD'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  async updateExportExpirado(id: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const result = await tx.$executeRaw`
      UPDATE lgpd_exports
         SET status     = 'EXPIRADO'::enum_lgpd_export_status,
             updated_at = now()
       WHERE id = ${id}::bigint
         AND status = 'PRONTO_PARA_DOWNLOAD'::enum_lgpd_export_status
    `;
    return Number(result);
  }

  // ─────────── Helpers ───────────

  /**
   * `solicitacoes_lgpd` não tem coluna `metadata`/`ip_origem`. Para não
   * perder os dados adicionais (validados pela camada de aplicação),
   * costuramos tudo em uma única `motivo` JSON-anotada — formato
   * estável, fácil de ler tanto pelo Encarregado quanto por integrações.
   */
  private composeMotivo(
    motivoBase: string | null,
    extras: {
      dadosAdicionais: Record<string, unknown> | null;
      ipOrigem: string | null;
      userAgent: string | null;
    },
  ): string | null {
    const hasExtras =
      extras.dadosAdicionais !== null ||
      extras.ipOrigem !== null ||
      extras.userAgent !== null;
    if (motivoBase === null && !hasExtras) {
      return null;
    }
    if (!hasExtras) {
      return motivoBase;
    }
    const meta: Record<string, unknown> = {};
    if (extras.dadosAdicionais !== null) {
      meta.dadosAdicionais = extras.dadosAdicionais;
    }
    if (extras.ipOrigem !== null) {
      meta.ipOrigem = extras.ipOrigem;
    }
    if (extras.userAgent !== null) {
      meta.userAgent = extras.userAgent;
    }
    const metaStr = `[meta]${JSON.stringify(meta)}`;
    return motivoBase === null ? metaStr : `${motivoBase}\n\n${metaStr}`;
  }
}
