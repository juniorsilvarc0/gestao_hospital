/**
 * `ExamesRepository` — fonte única de SQL do módulo exames.
 *
 * Cobre:
 *   - `solicitacoes_exame` + `solicitacoes_exame_itens` (cabeçalho + N).
 *   - `resultados_exame` (com `assinatura_digital` JSONB + `assinado_em`).
 *
 * Convenções:
 *   - Toda query passa por `prisma.tx()` para herdar o RLS+SET LOCAL
 *     do `TenantContextInterceptor`.
 *   - Resolução de UUIDs externos (paciente, atendimento, prestador,
 *     procedimento) feita aqui — use cases não montam SQL de lookup.
 *
 * `tg_imutavel_apos_assinado` (DDL) bloqueia UPDATE/DELETE em
 * `resultados_exame` quando `assinado_em IS NOT NULL` — não há nada
 * a fazer no repositório pra isso (INVARIANTE #3 — banco enforça).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { SolicitacaoExameStatus } from '../dto/list-solicitacoes.dto';

export interface AtendimentoBasicsRow {
  id: bigint;
  pacienteId: bigint;
  status: string;
  dataHoraSaida: Date | null;
}

export interface SolicitacaoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  atendimento_id: bigint;
  atendimento_uuid: string;
  paciente_id: bigint;
  paciente_uuid: string;
  solicitante_id: bigint;
  solicitante_uuid: string;
  urgencia: 'ROTINA' | 'URGENTE' | 'EMERGENCIA';
  indicacao_clinica: string;
  numero_guia: string | null;
  status: SolicitacaoExameStatus;
  data_solicitacao: Date;
  data_realizacao: Date | null;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface SolicitacaoItemRow {
  id: bigint;
  uuid_externo: string;
  solicitacao_id: bigint;
  solicitacao_uuid: string;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  procedimento_codigo: string | null;
  observacao: string | null;
  status: SolicitacaoExameStatus;
  resultado_id: bigint | null;
  resultado_uuid: string | null;
}

export interface ResultadoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  solicitacao_item_id: bigint;
  solicitacao_item_uuid: string;
  solicitacao_uuid: string;
  paciente_id: bigint;
  paciente_uuid: string;
  laudista_id: bigint | null;
  laudista_uuid: string | null;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  data_coleta: Date | null;
  data_processamento: Date | null;
  data_laudo: Date | null;
  laudo_estruturado: unknown;
  laudo_texto: string | null;
  laudo_pdf_url: string | null;
  imagens_urls: unknown;
  status: SolicitacaoExameStatus;
  assinatura_digital: unknown;
  assinado_em: Date | null;
  versao_anterior_id: bigint | null;
  versao_anterior_uuid: string | null;
  created_at: Date;
}

export interface ListSolicitacoesParams {
  page: number;
  pageSize: number;
  atendimentoId?: bigint;
  pacienteId?: bigint;
  urgencia?: 'ROTINA' | 'URGENTE' | 'EMERGENCIA';
  status?: string[];
  rangeInicio?: string;
  rangeFim?: string;
}

export interface ListResultadosParams {
  page: number;
  pageSize: number;
  pacienteId?: bigint;
  laudistaId?: bigint;
  status?: string[];
  apenasAssinados?: boolean;
}

const SOLICITACAO_SELECT = Prisma.sql`
  SELECT
    s.id, s.uuid_externo::text AS uuid_externo, s.tenant_id,
    s.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
    s.paciente_id,    p.uuid_externo::text AS paciente_uuid,
    s.solicitante_id, pr.uuid_externo::text AS solicitante_uuid,
    s.urgencia::text  AS urgencia,
    s.indicacao_clinica,
    s.numero_guia,
    s.status::text    AS status,
    s.data_solicitacao,
    s.data_realizacao,
    s.observacao,
    s.created_at,
    s.updated_at
  FROM solicitacoes_exame s
  JOIN atendimentos a  ON a.id  = s.atendimento_id
  JOIN pacientes    p  ON p.id  = s.paciente_id
  JOIN prestadores  pr ON pr.id = s.solicitante_id
`;

const ITEM_SELECT = Prisma.sql`
  SELECT
    i.id, i.uuid_externo::text AS uuid_externo,
    i.solicitacao_id,
    s.uuid_externo::text AS solicitacao_uuid,
    i.procedimento_id,
    tp.uuid_externo::text AS procedimento_uuid,
    tp.nome        AS procedimento_nome,
    tp.codigo_tuss AS procedimento_codigo,
    i.observacao,
    i.status::text AS status,
    i.resultado_id,
    re.uuid_externo::text AS resultado_uuid
  FROM solicitacoes_exame_itens i
  JOIN solicitacoes_exame      s  ON s.id  = i.solicitacao_id
  JOIN tabelas_procedimentos   tp ON tp.id = i.procedimento_id
  LEFT JOIN resultados_exame   re ON re.id = i.resultado_id
`;

const RESULTADO_SELECT = Prisma.sql`
  SELECT
    r.id, r.uuid_externo::text AS uuid_externo, r.tenant_id,
    r.solicitacao_item_id,
    si.uuid_externo::text AS solicitacao_item_uuid,
    s.uuid_externo::text  AS solicitacao_uuid,
    r.paciente_id,
    pa.uuid_externo::text AS paciente_uuid,
    r.laudista_id,
    pr.uuid_externo::text AS laudista_uuid,
    tp.uuid_externo::text AS procedimento_uuid,
    tp.nome               AS procedimento_nome,
    r.data_coleta,
    r.data_processamento,
    r.data_laudo,
    r.laudo_estruturado,
    r.laudo_texto,
    r.laudo_pdf_url,
    r.imagens_urls,
    r.status::text        AS status,
    r.assinatura_digital,
    r.assinado_em,
    r.versao_anterior_id,
    rva.uuid_externo::text AS versao_anterior_uuid,
    r.created_at
  FROM resultados_exame r
  JOIN solicitacoes_exame_itens si ON si.id = r.solicitacao_item_id
  JOIN solicitacoes_exame       s  ON s.id  = si.solicitacao_id
  JOIN tabelas_procedimentos    tp ON tp.id = si.procedimento_id
  JOIN pacientes                pa ON pa.id = r.paciente_id
  LEFT JOIN prestadores         pr  ON pr.id  = r.laudista_id
  LEFT JOIN resultados_exame    rva ON rva.id = r.versao_anterior_id
`;

@Injectable()
export class ExamesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────── Lookups ───────────────

  async findAtendimentoBasicsByUuid(
    uuid: string,
  ): Promise<AtendimentoBasicsRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        paciente_id: bigint;
        status: string;
        data_hora_saida: Date | null;
      }>
    >`
      SELECT id, paciente_id, status::text AS status, data_hora_saida
        FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      pacienteId: rows[0].paciente_id,
      status: rows[0].status,
      dataHoraSaida: rows[0].data_hora_saida,
    };
  }

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPrestadorIdByUserId(usuarioId: bigint): Promise<bigint | null> {
    const tx = this.prisma.tx();
    // `usuarios.prestador_id` é a referência canônica usuário→prestador.
    const rows = await tx.$queryRaw<{ prestador_id: bigint | null }[]>`
      SELECT prestador_id FROM usuarios
       WHERE id = ${usuarioId}::bigint AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0].prestador_id;
  }

  async findProcedimentosByUuids(
    uuids: string[],
  ): Promise<Map<string, { id: bigint; nome: string | null }>> {
    if (uuids.length === 0) return new Map();
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string; nome: string | null }[]
    >`
      SELECT id, uuid_externo::text AS uuid_externo, nome
        FROM tabelas_procedimentos
       WHERE uuid_externo = ANY(${uuids}::uuid[]) AND ativo = TRUE
    `;
    const out = new Map<string, { id: bigint; nome: string | null }>();
    for (const r of rows) out.set(r.uuid_externo, { id: r.id, nome: r.nome });
    return out;
  }

  // ─────────────── Solicitações ───────────────

  async findSolicitacaoByUuid(uuid: string): Promise<SolicitacaoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<SolicitacaoRow[]>(
      Prisma.sql`${SOLICITACAO_SELECT} WHERE s.uuid_externo = ${uuid}::uuid LIMIT 1`,
    );
    return rows.length === 0 ? null : rows[0];
  }

  async findSolicitacaoLockedByUuid(
    uuid: string,
  ): Promise<{
    id: bigint;
    status: SolicitacaoExameStatus;
    paciente_id: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        status: SolicitacaoExameStatus;
        paciente_id: bigint;
      }>
    >`
      SELECT id, status::text AS status, paciente_id
        FROM solicitacoes_exame
       WHERE uuid_externo = ${uuid}::uuid
       FOR UPDATE
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findItensBySolicitacaoId(
    solicitacaoId: bigint,
  ): Promise<SolicitacaoItemRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<SolicitacaoItemRow[]>(
      Prisma.sql`${ITEM_SELECT} WHERE i.solicitacao_id = ${solicitacaoId}::bigint ORDER BY i.id ASC`,
    );
  }

  async findItemByUuid(uuid: string): Promise<SolicitacaoItemRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<SolicitacaoItemRow[]>(
      Prisma.sql`${ITEM_SELECT} WHERE i.uuid_externo = ${uuid}::uuid LIMIT 1`,
    );
    return rows.length === 0 ? null : rows[0];
  }

  async listSolicitacoes(
    params: ListSolicitacoesParams,
  ): Promise<{ data: SolicitacaoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (params.atendimentoId !== undefined) {
      where.push(Prisma.sql`s.atendimento_id = ${params.atendimentoId}::bigint`);
    }
    if (params.pacienteId !== undefined) {
      where.push(Prisma.sql`s.paciente_id = ${params.pacienteId}::bigint`);
    }
    if (params.urgencia !== undefined) {
      where.push(
        Prisma.sql`s.urgencia = ${params.urgencia}::enum_solicitacao_exame_urgencia`,
      );
    }
    if (params.status !== undefined && params.status.length > 0) {
      const sanitized = params.status.filter((s) => /^[A-Z_]+$/.test(s));
      if (sanitized.length > 0) {
        const list = Prisma.join(
          sanitized.map(
            (s) => Prisma.sql`${s}::enum_solicitacao_exame_status`,
          ),
          ', ',
        );
        where.push(Prisma.sql`s.status IN (${list})`);
      }
    }
    if (params.rangeInicio !== undefined) {
      where.push(
        Prisma.sql`s.data_solicitacao >= ${params.rangeInicio}::timestamptz`,
      );
    }
    if (params.rangeFim !== undefined) {
      where.push(
        Prisma.sql`s.data_solicitacao < ${params.rangeFim}::timestamptz`,
      );
    }

    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM solicitacoes_exame s WHERE ${whereClause}`,
      ),
      tx.$queryRaw<SolicitacaoRow[]>(
        Prisma.sql`
          ${SOLICITACAO_SELECT}
          WHERE ${whereClause}
          ORDER BY s.data_solicitacao DESC, s.id DESC
          LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async insertSolicitacao(input: {
    tenantId: bigint;
    atendimentoId: bigint;
    pacienteId: bigint;
    solicitanteId: bigint;
    urgencia: 'ROTINA' | 'URGENTE' | 'EMERGENCIA';
    indicacaoClinica: string;
    numeroGuia: string | null;
    observacao: string | null;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO solicitacoes_exame (
        tenant_id, atendimento_id, paciente_id, solicitante_id,
        urgencia, indicacao_clinica, numero_guia, observacao,
        status
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.atendimentoId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.solicitanteId}::bigint,
        ${input.urgencia}::enum_solicitacao_exame_urgencia,
        ${input.indicacaoClinica},
        ${input.numeroGuia},
        ${input.observacao},
        'SOLICITADO'::enum_solicitacao_exame_status
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async insertItens(
    solicitacaoId: bigint,
    tenantId: bigint,
    itens: Array<{ procedimentoId: bigint; observacao: string | null }>,
  ): Promise<void> {
    if (itens.length === 0) return;
    const tx = this.prisma.tx();
    for (const it of itens) {
      await tx.$executeRaw`
        INSERT INTO solicitacoes_exame_itens (
          tenant_id, solicitacao_id, procedimento_id, observacao, status
        ) VALUES (
          ${tenantId}::bigint,
          ${solicitacaoId}::bigint,
          ${it.procedimentoId}::bigint,
          ${it.observacao},
          'SOLICITADO'::enum_solicitacao_exame_status
        )
      `;
    }
  }

  async marcarColeta(
    solicitacaoId: bigint,
    dataColeta: Date,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE solicitacoes_exame
         SET status          = 'COLETADO'::enum_solicitacao_exame_status,
             data_realizacao = ${dataColeta}::timestamptz,
             updated_at      = now()
       WHERE id = ${solicitacaoId}::bigint
    `;
    // Itens ainda em status pré-coleta → COLETADO.
    await tx.$executeRaw`
      UPDATE solicitacoes_exame_itens
         SET status = 'COLETADO'::enum_solicitacao_exame_status
       WHERE solicitacao_id = ${solicitacaoId}::bigint
         AND status IN (
           'SOLICITADO'::enum_solicitacao_exame_status,
           'AUTORIZADO'::enum_solicitacao_exame_status
         )
    `;
  }

  async cancelarSolicitacao(
    solicitacaoId: bigint,
    motivo: string,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE solicitacoes_exame
         SET status     = 'CANCELADO'::enum_solicitacao_exame_status,
             observacao = COALESCE(observacao || E'\n', '') || 'CANCELADO: ' || ${motivo}::text,
             updated_at = now()
       WHERE id = ${solicitacaoId}::bigint
    `;
    // Itens não-laudados também são cancelados.
    await tx.$executeRaw`
      UPDATE solicitacoes_exame_itens
         SET status = 'CANCELADO'::enum_solicitacao_exame_status
       WHERE solicitacao_id = ${solicitacaoId}::bigint
         AND status NOT IN (
           'LAUDO_FINAL'::enum_solicitacao_exame_status,
           'CANCELADO'::enum_solicitacao_exame_status
         )
    `;
  }

  async setItemStatus(
    itemId: bigint,
    status: SolicitacaoExameStatus,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE solicitacoes_exame_itens
         SET status = ${status}::enum_solicitacao_exame_status
       WHERE id = ${itemId}::bigint
    `;
  }

  async setItemResultadoId(itemId: bigint, resultadoId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE solicitacoes_exame_itens
         SET resultado_id = ${resultadoId}::bigint
       WHERE id = ${itemId}::bigint
    `;
  }

  /**
   * Recalcula o status do parent baseado nos itens.
   * Regra:
   *   - Todos itens em LAUDO_FINAL → parent LAUDO_FINAL.
   *   - Pelo menos um LAUDO_FINAL/PARCIAL → parent LAUDO_PARCIAL.
   *   - Caso contrário, mantém o status atual.
   */
  async recomputeSolicitacaoStatus(solicitacaoId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{ total: bigint; finais: bigint; parciais: bigint; cancelados: bigint }>
    >`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE status = 'LAUDO_FINAL'::enum_solicitacao_exame_status)::bigint AS finais,
        COUNT(*) FILTER (
          WHERE status IN (
            'LAUDO_FINAL'::enum_solicitacao_exame_status,
            'LAUDO_PARCIAL'::enum_solicitacao_exame_status
          )
        )::bigint AS parciais,
        COUNT(*) FILTER (WHERE status = 'CANCELADO'::enum_solicitacao_exame_status)::bigint AS cancelados
      FROM solicitacoes_exame_itens
      WHERE solicitacao_id = ${solicitacaoId}::bigint
    `;
    if (rows.length === 0) return;
    const r = rows[0];
    const total = Number(r.total);
    const finais = Number(r.finais);
    const parciais = Number(r.parciais);
    const cancelados = Number(r.cancelados);
    if (total === 0) return;

    // total === finais (ignorando cancelados? Trate canceladoss como
    // "fora da contagem" — se todos os não-cancelados forem finais,
    // a solicitação está finalizada.)
    const ativos = total - cancelados;
    let novo: SolicitacaoExameStatus | null = null;
    if (ativos > 0 && finais === ativos) novo = 'LAUDO_FINAL';
    else if (parciais > 0) novo = 'LAUDO_PARCIAL';

    if (novo === null) return;
    await tx.$executeRaw`
      UPDATE solicitacoes_exame
         SET status     = ${novo}::enum_solicitacao_exame_status,
             updated_at = now()
       WHERE id = ${solicitacaoId}::bigint
    `;
  }

  // ─────────────── Resultados ───────────────

  async findResultadoByUuid(uuid: string): Promise<ResultadoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ResultadoRow[]>(
      Prisma.sql`${RESULTADO_SELECT} WHERE r.uuid_externo = ${uuid}::uuid LIMIT 1`,
    );
    return rows.length === 0 ? null : rows[0];
  }

  async listResultados(
    params: ListResultadosParams,
  ): Promise<{ data: ResultadoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (params.pacienteId !== undefined) {
      where.push(Prisma.sql`r.paciente_id = ${params.pacienteId}::bigint`);
    }
    if (params.laudistaId !== undefined) {
      where.push(Prisma.sql`r.laudista_id = ${params.laudistaId}::bigint`);
    }
    if (params.status !== undefined && params.status.length > 0) {
      const sanitized = params.status.filter((s) => /^[A-Z_]+$/.test(s));
      if (sanitized.length > 0) {
        const list = Prisma.join(
          sanitized.map(
            (s) => Prisma.sql`${s}::enum_solicitacao_exame_status`,
          ),
          ', ',
        );
        where.push(Prisma.sql`r.status IN (${list})`);
      }
    }
    if (params.apenasAssinados === true) {
      where.push(Prisma.sql`r.assinado_em IS NOT NULL`);
    }

    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM resultados_exame r WHERE ${whereClause}`,
      ),
      tx.$queryRaw<ResultadoRow[]>(
        Prisma.sql`
          ${RESULTADO_SELECT}
          WHERE ${whereClause}
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async insertResultado(input: {
    tenantId: bigint;
    solicitacaoItemId: bigint;
    pacienteId: bigint;
    dataColeta: Date | null;
    dataProcessamento: Date | null;
    laudoEstruturado: unknown;
    laudoTexto: string | null;
    laudoPdfUrl: string | null;
    imagensUrls: string[] | null;
    status: SolicitacaoExameStatus;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO resultados_exame (
        tenant_id, solicitacao_item_id, paciente_id,
        data_coleta, data_processamento,
        laudo_estruturado, laudo_texto, laudo_pdf_url, imagens_urls,
        status
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.solicitacaoItemId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.dataColeta}::timestamptz,
        ${input.dataProcessamento}::timestamptz,
        ${
          input.laudoEstruturado === null || input.laudoEstruturado === undefined
            ? null
            : JSON.stringify(input.laudoEstruturado)
        }::jsonb,
        ${input.laudoTexto},
        ${input.laudoPdfUrl},
        ${
          input.imagensUrls === null
            ? null
            : JSON.stringify(input.imagensUrls)
        }::jsonb,
        ${input.status}::enum_solicitacao_exame_status
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async laudarResultado(input: {
    resultadoId: bigint;
    laudistaId: bigint | null;
    assinaturaJsonb: Record<string, unknown>;
    assinadoEm: Date;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE resultados_exame
         SET assinatura_digital = ${JSON.stringify(input.assinaturaJsonb)}::jsonb,
             assinado_em        = ${input.assinadoEm}::timestamptz,
             data_laudo         = ${input.assinadoEm}::timestamptz,
             laudista_id        = ${input.laudistaId}::bigint,
             status             = 'LAUDO_FINAL'::enum_solicitacao_exame_status
       WHERE id = ${input.resultadoId}::bigint
         AND assinado_em IS NULL
    `;
  }
}
