/**
 * `AdminRepository` — fonte única de SQL do módulo Admin Global.
 *
 * CRÍTICO — bypass de RLS:
 *   `tenants`, `audit_security_events`, `perfis` e `usuarios_perfis` são
 *   tabelas com RLS habilitado. Como o ADMIN_GLOBAL precisa enxergar
 *   TODOS os tenants, usamos `prisma.$transaction` com
 *   `SET LOCAL row_security = OFF` (Postgres 16+ — suportado quando o
 *   role tem BYPASSRLS ou é o próprio dono da tabela). O role usado
 *   pelo Prisma no docker-compose tem BYPASSRLS — ver
 *   `infra/docker/postgres/init-rls.sql`.
 *
 *   Em produção isso pressupõe que o role do Prisma tenha BYPASSRLS;
 *   alternativamente, listar via `UNION ALL` por tenant não é viável.
 *   Hardening adicional fica como TODO Phase 13+.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface TenantRow {
  id: bigint;
  uuid_externo: string;
  codigo: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnes: string | null;
  registro_ans: string | null;
  versao_tiss_padrao: string;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
  deleted_at: Date | null;
}

export interface SecurityEventRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint | null;
  tenant_uuid: string | null;
  tenant_codigo: string | null;
  tipo: string;
  severidade: string;
  usuario_id: bigint | null;
  usuario_uuid: string | null;
  alvo_usuario_id: bigint | null;
  alvo_usuario_uuid: string | null;
  ip_origem: string | null;
  user_agent: string | null;
  request_path: string | null;
  request_method: string | null;
  detalhes: Record<string, unknown>;
  created_at: Date;
}

export interface InsertTenantArgs {
  codigo: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnes: string | null;
  registroAns: string | null;
  versaoTissPadrao: string;
  ativo: boolean;
}

export interface UpdateTenantArgs {
  id: bigint;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnes?: string;
  registroAns?: string;
  versaoTissPadrao?: string;
}

export interface ListSecurityFilters {
  tenantUuid?: string;
  tipo?: string;
  severidade?: string;
  dataInicio?: string;
  dataFim?: string;
  ip?: string;
  page: number;
  pageSize: number;
}

export interface DashboardCounter {
  key: string;
  count: number;
}

const PERFIS_PADRAO: Array<{ codigo: string; nome: string; descricao: string }> = [
  { codigo: 'ADMIN', nome: 'Administrador', descricao: 'Administrador do tenant' },
  { codigo: 'MEDICO', nome: 'Médico', descricao: 'Médico assistente' },
  { codigo: 'ENFERMEIRO', nome: 'Enfermeiro', descricao: 'Equipe de enfermagem' },
  { codigo: 'FARMACEUTICO', nome: 'Farmacêutico', descricao: 'Farmácia hospitalar' },
  { codigo: 'FATURISTA', nome: 'Faturista', descricao: 'Faturamento e contas' },
  { codigo: 'AUDITOR', nome: 'Auditor', descricao: 'Auditoria e glosas' },
  { codigo: 'RECEPCAO', nome: 'Recepção', descricao: 'Recepção e check-in' },
  { codigo: 'TRIAGEM', nome: 'Triagem', descricao: 'Triagem Manchester' },
  { codigo: 'PACIENTE_PORTAL', nome: 'Paciente (Portal)', descricao: 'Acesso self-service do paciente' },
];

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executa uma função num bloco transacional com RLS desligado.
   * Necessário para queries cross-tenant.
   */
  private async withRlsBypass<T>(
    fn: (tx: unknown) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRawUnsafe('SET LOCAL row_security = OFF');
      } catch {
        // Em alguns roles o SET LOCAL row_security não funciona;
        // BYPASSRLS já cobre. Engole — a barreira final é a checagem
        // de `ADMIN_GLOBAL` no guard.
      }
      return fn(tx);
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Tenants
  // ════════════════════════════════════════════════════════════════

  async listAllTenants(args: {
    page: number;
    pageSize: number;
  }): Promise<{ rows: TenantRow[]; total: number }> {
    const offset = (args.page - 1) * args.pageSize;
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<TenantRow[]>(
        `
          SELECT id, uuid_externo, codigo, cnpj, razao_social, nome_fantasia,
                 cnes, registro_ans, versao_tiss_padrao, ativo,
                 created_at, updated_at, deleted_at
            FROM tenants
           WHERE deleted_at IS NULL
           ORDER BY codigo ASC
           LIMIT $1 OFFSET $2
        `,
        args.pageSize,
        offset,
      );
      const totalRows = await txAny.$queryRawUnsafe<Array<{ total: bigint }>>(
        'SELECT COUNT(*)::bigint AS total FROM tenants WHERE deleted_at IS NULL',
      );
      return {
        rows,
        total: Number(totalRows[0]?.total ?? 0n),
      };
    });
  }

  async findTenantByUuid(uuid: string): Promise<TenantRow | null> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<TenantRow[]>(
        `
          SELECT id, uuid_externo, codigo, cnpj, razao_social, nome_fantasia,
                 cnes, registro_ans, versao_tiss_padrao, ativo,
                 created_at, updated_at, deleted_at
            FROM tenants
           WHERE uuid_externo = $1::uuid
           LIMIT 1
        `,
        uuid,
      );
      return rows.length === 0 ? null : rows[0];
    });
  }

  async findTenantByCodigo(codigo: string): Promise<TenantRow | null> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<TenantRow[]>(
        'SELECT id, uuid_externo, codigo, cnpj, razao_social, nome_fantasia, cnes, registro_ans, versao_tiss_padrao, ativo, created_at, updated_at, deleted_at FROM tenants WHERE codigo = $1 LIMIT 1',
        codigo,
      );
      return rows.length === 0 ? null : rows[0];
    });
  }

  async findTenantByCnpj(cnpj: string): Promise<TenantRow | null> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<TenantRow[]>(
        'SELECT id, uuid_externo, codigo, cnpj, razao_social, nome_fantasia, cnes, registro_ans, versao_tiss_padrao, ativo, created_at, updated_at, deleted_at FROM tenants WHERE cnpj = $1 LIMIT 1',
        cnpj,
      );
      return rows.length === 0 ? null : rows[0];
    });
  }

  /**
   * Insere o tenant + perfis padrão em uma transação. Retorna a row
   * recém-criada (re-fetch para pegar uuid e timestamps).
   */
  async insertTenantWithDefaultProfiles(
    args: InsertTenantArgs,
  ): Promise<TenantRow> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
        $executeRawUnsafe: (
          query: string,
          ...params: unknown[]
        ) => Promise<number>;
      };

      const inserted = await txAny.$queryRawUnsafe<TenantRow[]>(
        `
          INSERT INTO tenants (
            codigo, cnpj, razao_social, nome_fantasia, cnes, registro_ans,
            versao_tiss_padrao, ativo
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
          )
          RETURNING id, uuid_externo, codigo, cnpj, razao_social, nome_fantasia,
                    cnes, registro_ans, versao_tiss_padrao, ativo,
                    created_at, updated_at, deleted_at
        `,
        args.codigo,
        args.cnpj,
        args.razaoSocial,
        args.nomeFantasia,
        args.cnes,
        args.registroAns,
        args.versaoTissPadrao,
        args.ativo,
      );

      const tenant = inserted[0];
      if (tenant === undefined) {
        throw new Error('Insert tenant did not return a row.');
      }

      // Set local context para os INSERTs em perfis (RLS força tenant_id
      // bater com app.current_tenant_id).
      await txAny.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenant.id.toString()}'`,
      );

      for (const perfil of PERFIS_PADRAO) {
        await txAny.$executeRawUnsafe(
          `
            INSERT INTO perfis (tenant_id, codigo, nome, descricao, ativo)
            VALUES ($1::bigint, $2, $3, $4, TRUE)
            ON CONFLICT (tenant_id, codigo) DO NOTHING
          `,
          tenant.id,
          perfil.codigo,
          perfil.nome,
          perfil.descricao,
        );
      }

      return tenant;
    });
  }

  async updateTenant(args: UpdateTenantArgs): Promise<void> {
    const fragments: string[] = [];
    const params: unknown[] = [];
    let pos = 1;
    if (args.razaoSocial !== undefined) {
      fragments.push(`razao_social = $${pos++}`);
      params.push(args.razaoSocial);
    }
    if (args.nomeFantasia !== undefined) {
      fragments.push(`nome_fantasia = $${pos++}`);
      params.push(args.nomeFantasia);
    }
    if (args.cnes !== undefined) {
      fragments.push(`cnes = $${pos++}`);
      params.push(args.cnes);
    }
    if (args.registroAns !== undefined) {
      fragments.push(`registro_ans = $${pos++}`);
      params.push(args.registroAns);
    }
    if (args.versaoTissPadrao !== undefined) {
      fragments.push(`versao_tiss_padrao = $${pos++}`);
      params.push(args.versaoTissPadrao);
    }
    if (fragments.length === 0) {
      return;
    }
    fragments.push(`updated_at = now()`);
    params.push(args.id);
    const sql = `UPDATE tenants SET ${fragments.join(', ')} WHERE id = $${pos}::bigint`;
    await this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $executeRawUnsafe: (
          query: string,
          ...params: unknown[]
        ) => Promise<number>;
      };
      await txAny.$executeRawUnsafe(sql, ...params);
    });
  }

  async setTenantAtivo(id: bigint, ativo: boolean): Promise<void> {
    await this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $executeRawUnsafe: (
          query: string,
          ...params: unknown[]
        ) => Promise<number>;
      };
      await txAny.$executeRawUnsafe(
        'UPDATE tenants SET ativo = $1, updated_at = now() WHERE id = $2::bigint',
        ativo,
        id,
      );
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Perfis (lookup)
  // ════════════════════════════════════════════════════════════════

  /** Verifica se o usuário tem o perfil ADMIN_GLOBAL ativo (cross-tenant). */
  async isUserAdminGlobal(usuarioId: bigint): Promise<boolean> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<Array<{ found: bigint }>>(
        `
          SELECT 1::bigint AS found
            FROM usuarios_perfis up
            JOIN perfis p ON p.id = up.perfil_id
           WHERE up.usuario_id = $1::bigint
             AND p.codigo = 'ADMIN_GLOBAL'
             AND p.ativo = TRUE
           LIMIT 1
        `,
        usuarioId,
      );
      return rows.length > 0;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Security events
  // ════════════════════════════════════════════════════════════════

  async listSecurityEvents(
    filters: ListSecurityFilters,
  ): Promise<{ rows: SecurityEventRow[]; total: number }> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };

      const where: string[] = [];
      const params: unknown[] = [];
      let pos = 1;
      if (filters.tenantUuid !== undefined) {
        where.push(`t.uuid_externo = $${pos++}::uuid`);
        params.push(filters.tenantUuid);
      }
      if (filters.tipo !== undefined) {
        where.push(`ase.tipo = $${pos++}::enum_security_event_tipo`);
        params.push(filters.tipo);
      }
      if (filters.severidade !== undefined) {
        where.push(`ase.severidade = $${pos++}::enum_security_event_severidade`);
        params.push(filters.severidade);
      }
      if (filters.dataInicio !== undefined) {
        where.push(`ase.created_at >= $${pos++}::timestamptz`);
        params.push(filters.dataInicio);
      }
      if (filters.dataFim !== undefined) {
        where.push(`ase.created_at <= $${pos++}::timestamptz`);
        params.push(filters.dataFim);
      }
      if (filters.ip !== undefined) {
        where.push(`ase.ip_origem = $${pos++}::inet`);
        params.push(filters.ip);
      }
      const whereSql = where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`;

      const offset = (filters.page - 1) * filters.pageSize;
      const dataSql = `
        SELECT ase.id,
               ase.uuid_externo,
               ase.tenant_id,
               t.uuid_externo AS tenant_uuid,
               t.codigo       AS tenant_codigo,
               ase.tipo,
               ase.severidade,
               ase.usuario_id,
               u.uuid_externo AS usuario_uuid,
               ase.alvo_usuario_id,
               au.uuid_externo AS alvo_usuario_uuid,
               ase.ip_origem,
               ase.user_agent,
               ase.request_path,
               ase.request_method,
               ase.detalhes,
               ase.created_at
          FROM audit_security_events ase
          LEFT JOIN tenants t ON t.id = ase.tenant_id
          LEFT JOIN usuarios u ON u.id = ase.usuario_id
          LEFT JOIN usuarios au ON au.id = ase.alvo_usuario_id
        ${whereSql}
        ORDER BY ase.created_at DESC
        LIMIT $${pos} OFFSET $${pos + 1}
      `;
      const dataRows = await txAny.$queryRawUnsafe<SecurityEventRow[]>(
        dataSql,
        ...params,
        filters.pageSize,
        offset,
      );

      const countSql = `
        SELECT COUNT(*)::bigint AS total
          FROM audit_security_events ase
          LEFT JOIN tenants t ON t.id = ase.tenant_id
        ${whereSql}
      `;
      const countRows = await txAny.$queryRawUnsafe<Array<{ total: bigint }>>(
        countSql,
        ...params,
      );

      return {
        rows: dataRows,
        total: Number(countRows[0]?.total ?? 0n),
      };
    });
  }

  async findSecurityEventByUuid(
    uuid: string,
  ): Promise<SecurityEventRow | null> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<SecurityEventRow[]>(
        `
          SELECT ase.id, ase.uuid_externo, ase.tenant_id,
                 t.uuid_externo AS tenant_uuid, t.codigo AS tenant_codigo,
                 ase.tipo, ase.severidade, ase.usuario_id,
                 u.uuid_externo AS usuario_uuid, ase.alvo_usuario_id,
                 au.uuid_externo AS alvo_usuario_uuid,
                 ase.ip_origem, ase.user_agent, ase.request_path,
                 ase.request_method, ase.detalhes, ase.created_at
            FROM audit_security_events ase
            LEFT JOIN tenants t ON t.id = ase.tenant_id
            LEFT JOIN usuarios u ON u.id = ase.usuario_id
            LEFT JOIN usuarios au ON au.id = ase.alvo_usuario_id
           WHERE ase.uuid_externo = $1::uuid
           LIMIT 1
        `,
        uuid,
      );
      return rows.length === 0 ? null : rows[0];
    });
  }

  async aggregateByTipo(dias: number): Promise<DashboardCounter[]> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<
        Array<{ tipo: string; count: bigint }>
      >(
        `
          SELECT tipo::text AS tipo, COUNT(*)::bigint AS count
            FROM audit_security_events
           WHERE created_at >= now() - ($1::int || ' days')::interval
           GROUP BY tipo
           ORDER BY count DESC
        `,
        dias,
      );
      return rows.map((r) => ({ key: r.tipo, count: Number(r.count) }));
    });
  }

  async aggregateBySeveridade(dias: number): Promise<DashboardCounter[]> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<
        Array<{ severidade: string; count: bigint }>
      >(
        `
          SELECT severidade::text AS severidade, COUNT(*)::bigint AS count
            FROM audit_security_events
           WHERE created_at >= now() - ($1::int || ' days')::interval
           GROUP BY severidade
           ORDER BY count DESC
        `,
        dias,
      );
      return rows.map((r) => ({ key: r.severidade, count: Number(r.count) }));
    });
  }

  async aggregateByTenant(
    dias: number,
  ): Promise<
    Array<{ tenantUuid: string | null; tenantCodigo: string | null; count: number }>
  > {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<
        Array<{
          tenant_uuid: string | null;
          tenant_codigo: string | null;
          count: bigint;
        }>
      >(
        `
          SELECT t.uuid_externo AS tenant_uuid,
                 t.codigo       AS tenant_codigo,
                 COUNT(*)::bigint AS count
            FROM audit_security_events ase
            LEFT JOIN tenants t ON t.id = ase.tenant_id
           WHERE ase.created_at >= now() - ($1::int || ' days')::interval
           GROUP BY t.uuid_externo, t.codigo
           ORDER BY count DESC
           LIMIT 50
        `,
        dias,
      );
      return rows.map((r) => ({
        tenantUuid: r.tenant_uuid,
        tenantCodigo: r.tenant_codigo,
        count: Number(r.count),
      }));
    });
  }

  async countEventsInWindow(dias: number): Promise<number> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<Array<{ total: bigint }>>(
        `
          SELECT COUNT(*)::bigint AS total
            FROM audit_security_events
           WHERE created_at >= now() - ($1::int || ' days')::interval
        `,
        dias,
      );
      return Number(rows[0]?.total ?? 0n);
    });
  }

  async aggregateByIp(
    dias: number,
    limit: number,
  ): Promise<
    Array<{
      ip: string;
      count: number;
      bloqueioTipos: string[];
    }>
  > {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      // host(ip_origem) garante string textual mesmo com sufixo /32.
      const rows = await txAny.$queryRawUnsafe<
        Array<{ ip: string; count: bigint; tipos: string[] | null }>
      >(
        `
          SELECT host(ip_origem) AS ip,
                 COUNT(*)::bigint AS count,
                 ARRAY_AGG(DISTINCT tipo::text)
                   FILTER (WHERE tipo IN ('BLOQUEIO_TEMPORARIO','BLOQUEIO_DEFINITIVO'))
                   AS tipos
            FROM audit_security_events
           WHERE ip_origem IS NOT NULL
             AND created_at >= now() - ($1::int || ' days')::interval
           GROUP BY host(ip_origem)
           ORDER BY count DESC
           LIMIT $2::int
        `,
        dias,
        limit,
      );
      return rows.map((r) => ({
        ip: r.ip,
        count: Number(r.count),
        bloqueioTipos: r.tipos ?? [],
      }));
    });
  }

  async aggregateByTenantWithName(
    dias: number,
    limit: number,
  ): Promise<
    Array<{
      tenantUuid: string | null;
      tenantCodigo: string | null;
      tenantNome: string | null;
      count: number;
    }>
  > {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<
        Array<{
          tenant_uuid: string | null;
          tenant_codigo: string | null;
          tenant_nome: string | null;
          count: bigint;
        }>
      >(
        `
          SELECT t.uuid_externo AS tenant_uuid,
                 t.codigo       AS tenant_codigo,
                 COALESCE(t.nome_fantasia, t.razao_social) AS tenant_nome,
                 COUNT(*)::bigint AS count
            FROM audit_security_events ase
            LEFT JOIN tenants t ON t.id = ase.tenant_id
           WHERE ase.created_at >= now() - ($1::int || ' days')::interval
           GROUP BY t.uuid_externo, t.codigo, COALESCE(t.nome_fantasia, t.razao_social)
           ORDER BY count DESC
           LIMIT $2::int
        `,
        dias,
        limit,
      );
      return rows.map((r) => ({
        tenantUuid: r.tenant_uuid,
        tenantCodigo: r.tenant_codigo,
        tenantNome: r.tenant_nome,
        count: Number(r.count),
      }));
    });
  }

  async findRecentCriticalEvents(
    dias: number,
    limit: number,
  ): Promise<SecurityEventRow[]> {
    return this.withRlsBypass(async (tx) => {
      const txAny = tx as {
        $queryRawUnsafe: <T>(query: string, ...params: unknown[]) => Promise<T>;
      };
      const rows = await txAny.$queryRawUnsafe<SecurityEventRow[]>(
        `
          SELECT ase.id, ase.uuid_externo, ase.tenant_id,
                 t.uuid_externo AS tenant_uuid, t.codigo AS tenant_codigo,
                 ase.tipo, ase.severidade, ase.usuario_id,
                 u.uuid_externo AS usuario_uuid, ase.alvo_usuario_id,
                 au.uuid_externo AS alvo_usuario_uuid,
                 ase.ip_origem, ase.user_agent, ase.request_path,
                 ase.request_method, ase.detalhes, ase.created_at
            FROM audit_security_events ase
            LEFT JOIN tenants t ON t.id = ase.tenant_id
            LEFT JOIN usuarios u ON u.id = ase.usuario_id
            LEFT JOIN usuarios au ON au.id = ase.alvo_usuario_id
           WHERE ase.severidade IN ('ALERTA','CRITICO')
             AND ase.created_at >= now() - ($1::int || ' days')::interval
           ORDER BY ase.created_at DESC
           LIMIT $2::int
        `,
        dias,
        limit,
      );
      return rows;
    });
  }
}
