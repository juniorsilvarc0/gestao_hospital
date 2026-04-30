/**
 * `PacientesRepository` — fonte única de queries do bounded context
 * pacientes. Encapsula as queries SQL especiais (trigram, joins com
 * convênios) e devolve linhas tipadas para o presenter.
 *
 * Por que repository explícito (e não Prisma direto nos use cases)?
 *   - Busca trigram exige `$queryRaw` (Prisma não tem operador `%`).
 *   - Joins com convênios/planos para `vinculos` precisam de SELECT
 *     manual com aliases — não dá pra retornar `pacientes_convenios`
 *     cru com nested `convenios` e expor `id` BIGINT.
 *   - Centraliza a aplicação de soft-delete (sempre `WHERE deleted_at IS NULL`).
 *
 * Todas as queries usam `prisma.tx()` (RLS-aware) — o
 * `TenantContextInterceptor` já abriu transação com `SET LOCAL`.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { PacienteRow, VinculoRow } from '../application/paciente.presenter';

export interface ListPacientesParams {
  page: number;
  pageSize: number;
  q?: string;
  ativo?: boolean;
  convenioId?: bigint;
  nascidoEmGte?: string;
  nascidoEmLte?: string;
}

@Injectable()
export class PacientesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve o tenant atual do RequestContext (via `current_setting`).
   * Garante que JOINs manuais com `pacientes_mae` apliquem RLS — o
   * Postgres faz isso automaticamente porque a tabela tem
   * `tenant_isolation` policy. Mas mantemos `tenant_id` explícito nos
   * filtros para clareza e para encurtar plans.
   */

  /**
   * Busca um paciente por UUID externo (deletedAt = NULL).
   *
   * Não usa `findUnique` porque precisamos do JOIN com `pacientes_mae`
   * para devolver o UUID externo da mãe (não BIGINT).
   */
  async findByUuid(uuid: string): Promise<PacienteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacienteRow[]>`
      SELECT
        p.uuid_externo,
        p.codigo,
        p.nome,
        p.nome_social,
        p.cpf_hash,
        p.rg,
        p.cns,
        p.data_nascimento,
        p.sexo,
        p.tipo_sanguineo,
        p.nome_mae,
        p.nome_pai,
        p.estado_civil,
        p.profissao,
        p.raca_cor,
        p.nacionalidade,
        p.naturalidade_uf,
        p.naturalidade_cidade,
        p.endereco,
        p.contatos,
        p.alergias,
        p.comorbidades,
        p.tipo_atendimento_padrao,
        p.obito,
        p.data_obito,
        p.consentimento_lgpd,
        p.consentimento_lgpd_em,
        m.uuid_externo AS paciente_mae_uuid_externo,
        p.campos_complementares,
        p.versao,
        p.created_at,
        p.updated_at
      FROM pacientes p
      LEFT JOIN pacientes m ON m.id = p.paciente_mae_id AND m.deleted_at IS NULL
      WHERE p.uuid_externo = ${uuid}::uuid
        AND p.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Resolve o id BIGINT pelo UUID externo (utility usada por use cases
   * que precisam atualizar/relacionar). Retorna `null` se inexistente
   * ou soft-deleted.
   */
  async findIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const row = await tx.pacientes.findFirst({
      where: { uuid_externo: uuid, deleted_at: null },
      select: { id: true },
    });
    return row === null ? null : row.id;
  }

  /**
   * Resolve id por uuid_externo de convênio.
   * (`uuid_externo` em `convenios` foi adicionado pela migração da
   * Trilha B `20260429140000_uuid_externo_convenios_planos_cc`.)
   */
  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPlanoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM planos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  /**
   * Lista paginada com:
   *   - busca trigram em `f_unaccent(nome)` (`%` operator).
   *   - filtros simples (`ativo`, `convenio_id`, intervalo de
   *     data_nascimento).
   *
   * `ativo` é representado por `deleted_at IS NULL` (não há coluna
   * `ativo` em pacientes — soft-delete = inativo).
   */
  async list(
    params: ListPacientesParams,
  ): Promise<{ data: PacienteRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;

    // Construímos o WHERE como SQL fragments para combinar com $queryRaw.
    const where: Prisma.Sql[] = [Prisma.sql`p.deleted_at IS NULL`];

    if (params.ativo === false) {
      where.length = 0;
      where.push(Prisma.sql`p.deleted_at IS NOT NULL`);
    }

    if (params.q !== undefined && params.q.length > 0) {
      // f_unaccent(nome) % $q  (operador trigram, requer pg_trgm).
      // Também tentamos match exato em codigo / cns como fallback.
      where.push(
        Prisma.sql`(
          public.f_unaccent(p.nome) % public.f_unaccent(${params.q})
          OR p.codigo = ${params.q}
          OR p.cns = ${params.q}
        )`,
      );
    }

    if (params.convenioId !== undefined) {
      where.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM pacientes_convenios pc
            WHERE pc.paciente_id = p.id
              AND pc.convenio_id = ${params.convenioId}
              AND pc.deleted_at IS NULL
              AND pc.ativo = TRUE
        )`,
      );
    }

    if (params.nascidoEmGte !== undefined) {
      where.push(Prisma.sql`p.data_nascimento >= ${params.nascidoEmGte}::date`);
    }
    if (params.nascidoEmLte !== undefined) {
      where.push(Prisma.sql`p.data_nascimento <= ${params.nascidoEmLte}::date`);
    }

    const whereClause = Prisma.join(where, ' AND ');

    // Order by similarity DESC quando há `q`, senão por nome.
    const orderBy =
      params.q !== undefined && params.q.length > 0
        ? Prisma.sql`similarity(public.f_unaccent(p.nome), public.f_unaccent(${params.q})) DESC, p.nome ASC`
        : Prisma.sql`p.nome ASC`;

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM pacientes p WHERE ${whereClause}`,
      ),
      tx.$queryRaw<PacienteRow[]>(
        Prisma.sql`
          SELECT
            p.uuid_externo,
            p.codigo,
            p.nome,
            p.nome_social,
            p.cpf_hash,
            p.rg,
            p.cns,
            p.data_nascimento,
            p.sexo,
            p.tipo_sanguineo,
            p.nome_mae,
            p.nome_pai,
            p.estado_civil,
            p.profissao,
            p.raca_cor,
            p.nacionalidade,
            p.naturalidade_uf,
            p.naturalidade_cidade,
            p.endereco,
            p.contatos,
            p.alergias,
            p.comorbidades,
            p.tipo_atendimento_padrao,
            p.obito,
            p.data_obito,
            p.consentimento_lgpd,
            p.consentimento_lgpd_em,
            m.uuid_externo AS paciente_mae_uuid_externo,
            p.campos_complementares,
            p.versao,
            p.created_at,
            p.updated_at
          FROM pacientes p
          LEFT JOIN pacientes m ON m.id = p.paciente_mae_id AND m.deleted_at IS NULL
          WHERE ${whereClause}
          ORDER BY ${orderBy}
          LIMIT ${params.pageSize} OFFSET ${offset}
        `,
      ),
    ]);

    const total = countRows.length === 0 ? 0 : Number(countRows[0].total);
    return { data: rows, total };
  }

  /**
   * Busca por hash determinístico de CPF — operação O(log N) usando
   * `uq_pacientes_cpf_tenant`. Não decifra cpf_encrypted.
   */
  async findByCpfHash(hash: string): Promise<PacienteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacienteRow[]>`
      SELECT
        p.uuid_externo, p.codigo, p.nome, p.nome_social, p.cpf_hash, p.rg,
        p.cns, p.data_nascimento, p.sexo, p.tipo_sanguineo, p.nome_mae,
        p.nome_pai, p.estado_civil, p.profissao, p.raca_cor, p.nacionalidade,
        p.naturalidade_uf, p.naturalidade_cidade, p.endereco, p.contatos,
        p.alergias, p.comorbidades, p.tipo_atendimento_padrao, p.obito,
        p.data_obito, p.consentimento_lgpd, p.consentimento_lgpd_em,
        m.uuid_externo AS paciente_mae_uuid_externo, p.campos_complementares,
        p.versao, p.created_at, p.updated_at
      FROM pacientes p
      LEFT JOIN pacientes m ON m.id = p.paciente_mae_id AND m.deleted_at IS NULL
      WHERE p.cpf_hash = ${hash}
        AND p.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findByCns(cns: string): Promise<PacienteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacienteRow[]>`
      SELECT
        p.uuid_externo, p.codigo, p.nome, p.nome_social, p.cpf_hash, p.rg,
        p.cns, p.data_nascimento, p.sexo, p.tipo_sanguineo, p.nome_mae,
        p.nome_pai, p.estado_civil, p.profissao, p.raca_cor, p.nacionalidade,
        p.naturalidade_uf, p.naturalidade_cidade, p.endereco, p.contatos,
        p.alergias, p.comorbidades, p.tipo_atendimento_padrao, p.obito,
        p.data_obito, p.consentimento_lgpd, p.consentimento_lgpd_em,
        m.uuid_externo AS paciente_mae_uuid_externo, p.campos_complementares,
        p.versao, p.created_at, p.updated_at
      FROM pacientes p
      LEFT JOIN pacientes m ON m.id = p.paciente_mae_id AND m.deleted_at IS NULL
      WHERE p.cns = ${cns}
        AND p.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findByCodigo(codigo: string): Promise<PacienteRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacienteRow[]>`
      SELECT
        p.uuid_externo, p.codigo, p.nome, p.nome_social, p.cpf_hash, p.rg,
        p.cns, p.data_nascimento, p.sexo, p.tipo_sanguineo, p.nome_mae,
        p.nome_pai, p.estado_civil, p.profissao, p.raca_cor, p.nacionalidade,
        p.naturalidade_uf, p.naturalidade_cidade, p.endereco, p.contatos,
        p.alergias, p.comorbidades, p.tipo_atendimento_padrao, p.obito,
        p.data_obito, p.consentimento_lgpd, p.consentimento_lgpd_em,
        m.uuid_externo AS paciente_mae_uuid_externo, p.campos_complementares,
        p.versao, p.created_at, p.updated_at
      FROM pacientes p
      LEFT JOIN pacientes m ON m.id = p.paciente_mae_id AND m.deleted_at IS NULL
      WHERE p.codigo = ${codigo}
        AND p.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Lista vínculos ativos do paciente com convênios/planos. Devolve
   * `convenio_uuid`/`plano_uuid` (UUID externo, não BIGINT).
   */
  async listVinculos(pacienteId: bigint): Promise<VinculoRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<VinculoRow[]>`
      SELECT
        pc.uuid_externo            AS uuid_externo,
        pc.numero_carteirinha,
        pc.validade,
        pc.titular,
        pc.parentesco_titular,
        pc.prioridade,
        pc.ativo,
        pc.created_at,
        c.uuid_externo::text       AS convenio_uuid,
        c.nome                     AS convenio_nome,
        pl.uuid_externo::text      AS plano_uuid,
        pl.nome                    AS plano_nome
      FROM pacientes_convenios pc
      JOIN convenios c ON c.id = pc.convenio_id
      LEFT JOIN planos pl ON pl.id = pc.plano_id
      WHERE pc.paciente_id = ${pacienteId}
        AND pc.deleted_at IS NULL
      ORDER BY pc.prioridade ASC, pc.created_at DESC
    `;
  }

  /**
   * Resolve id (BIGINT) e paciente_id de um vínculo pelo UUID externo.
   */
  async findVinculoIdByUuid(
    uuid: string,
  ): Promise<{ id: bigint; pacienteId: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; paciente_id: bigint }[]>`
      SELECT id, paciente_id FROM pacientes_convenios
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) {
      return null;
    }
    return { id: rows[0].id, pacienteId: rows[0].paciente_id };
  }

  /**
   * Insere vínculo com `pacientes_convenios`. Use case faz validação
   * de existência de convênio/plano antes.
   */
  async createVinculo(input: {
    tenantId: bigint;
    pacienteId: bigint;
    convenioId: bigint;
    planoId: bigint | null;
    numeroCarteirinha: string;
    validade: string | null;
    titular: boolean;
    parentescoTitular: string | null;
    prioridade: number;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO pacientes_convenios
        (tenant_id, paciente_id, convenio_id, plano_id, numero_carteirinha,
         validade, titular, parentesco_titular, prioridade, ativo)
      VALUES
        (${input.tenantId}::bigint, ${input.pacienteId}::bigint,
         ${input.convenioId}::bigint, ${input.planoId}::bigint,
         ${input.numeroCarteirinha}, ${input.validade}::date,
         ${input.titular}, ${input.parentescoTitular},
         ${input.prioridade}, TRUE)
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async softDeleteVinculo(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE pacientes_convenios
         SET deleted_at = now(), ativo = FALSE
       WHERE id = ${id}::bigint
         AND deleted_at IS NULL
    `;
  }
}
