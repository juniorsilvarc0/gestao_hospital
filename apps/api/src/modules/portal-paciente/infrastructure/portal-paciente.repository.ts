/**
 * `PortalPacienteRepository` — fonte única de SQL do portal do paciente.
 *
 * Toda query usa `prisma.tx()` para herdar o `SET LOCAL
 * app.current_tenant_id` aplicado pelo `TenantContextInterceptor`.
 * Como há RLS em todas as tabelas multi-tenant, a tenant filter cai
 * automática.
 *
 * Filtros adicionais POR PACIENTE são aplicados aqui — RLS isola por
 * tenant, mas é responsabilidade do portal restringir para o paciente
 * logado (impossibilitando que paciente A leia dados do paciente B do
 * mesmo tenant).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface PacienteBasicRow {
  id: bigint;
  uuid_externo: string;
  nome: string;
  data_nascimento: Date | null;
  sexo: string | null;
}

export interface PortalAgendamentoRow {
  id: bigint;
  uuid_externo: string;
  inicio: Date;
  fim: Date;
  tipo: string;
  status: string;
  recurso_uuid: string;
  procedimento_uuid: string | null;
  convenio_uuid: string | null;
  observacao: string | null;
  link_teleconsulta: string | null;
}

export interface PortalExameRow {
  solicitacao_uuid: string;
  item_uuid: string;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  status: string;
  data_solicitacao: Date;
  resultado_uuid: string | null;
  resultado_status: string | null;
  resultado_assinado: boolean;
}

export interface PortalResultadoRow {
  uuid_externo: string;
  solicitacao_uuid: string;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  status: string;
  data_laudo: Date | null;
  laudo_texto: string | null;
  laudo_pdf_url: string | null;
  imagens_urls: unknown;
  assinado_em: Date | null;
}

export interface PortalReceitaRow {
  id: bigint;
  uuid_externo: string;
  tipo: string;
  emissor_nome: string | null;
  data_emissao: Date;
  pdf_url: string | null;
  assinado_em: Date | null;
}

export interface PortalContaRow {
  id: bigint;
  uuid_externo: string;
  numero_conta: string;
  status: string;
  tipo_cobranca: string;
  data_abertura: Date;
  data_fechamento: Date | null;
  valor_total: string;
  valor_pago: string;
  valor_liquido: string;
}

export interface PortalConsentimentoRow {
  id: bigint;
  uuid_externo: string;
  finalidade: string;
  versao_termo: string;
  aceito: boolean;
  data_decisao: Date;
  data_revogacao: Date | null;
  motivo_revogacao: string | null;
}

export interface PortalNotificacaoRow {
  id: bigint;
  uuid_externo: string;
  canal: string;
  assunto: string | null;
  conteudo: string;
  status: string;
  data_envio: Date | null;
  data_entrega: Date | null;
  data_leitura: Date | null;
  template_codigo: string | null;
  origem_evento: string | null;
  created_at: Date;
}

@Injectable()
export class PortalPacienteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────── Paciente ────────────────────────────

  async findPacienteBasicById(
    pacienteId: bigint,
  ): Promise<PacienteBasicRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PacienteBasicRow[]>`
      SELECT id, uuid_externo::text AS uuid_externo, nome,
             data_nascimento, sexo::text AS sexo
        FROM pacientes
       WHERE id = ${pacienteId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /** Convênios ativos do paciente — usado p/ validar auto-agendamento. */
  async listConveniosAtivos(
    pacienteId: bigint,
  ): Promise<{ convenio_id: bigint; plano_id: bigint | null }[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<{ convenio_id: bigint; plano_id: bigint | null }[]>`
      SELECT pc.convenio_id, pc.plano_id
        FROM pacientes_convenios pc
       WHERE pc.paciente_id = ${pacienteId}::bigint
         AND pc.ativo = TRUE
         AND pc.deleted_at IS NULL
         AND (pc.validade IS NULL OR pc.validade >= CURRENT_DATE)
    `;
  }

  // ────────────────────────────── Agendamentos ────────────────────────

  async listAgendamentosPaciente(params: {
    pacienteId: bigint;
    rangeInicio?: string;
    rangeFim?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: PortalAgendamentoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [
      Prisma.sql`a.paciente_id = ${params.pacienteId}::bigint`,
    ];
    if (params.rangeInicio !== undefined) {
      where.push(Prisma.sql`a.fim > ${params.rangeInicio}::timestamptz`);
    }
    if (params.rangeFim !== undefined) {
      where.push(Prisma.sql`a.inicio < ${params.rangeFim}::timestamptz`);
    }
    const whereSql = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM agendamentos a WHERE ${whereSql}`,
      ),
      tx.$queryRaw<PortalAgendamentoRow[]>(
        Prisma.sql`
          SELECT a.id, a.uuid_externo::text AS uuid_externo,
                 a.inicio, a.fim,
                 a.tipo::text   AS tipo,
                 a.status::text AS status,
                 ar.uuid_externo::text AS recurso_uuid,
                 tp.uuid_externo::text AS procedimento_uuid,
                 c.uuid_externo::text  AS convenio_uuid,
                 a.observacao,
                 a.link_teleconsulta
            FROM agendamentos a
            JOIN agendas_recursos ar ON ar.id = a.recurso_id
            LEFT JOIN tabelas_procedimentos tp ON tp.id = a.procedimento_id
            LEFT JOIN convenios c ON c.id = a.convenio_id
           WHERE ${whereSql}
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

  async countProximosAgendamentos(pacienteId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS total
        FROM agendamentos
       WHERE paciente_id = ${pacienteId}::bigint
         AND status IN ('AGENDADO','CONFIRMADO')
         AND inicio >= now()
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  async findAgendamentoPacienteByUuid(
    pacienteId: bigint,
    agendamentoUuid: string,
  ): Promise<{
    id: bigint;
    inicio: Date;
    fim: Date;
    link_teleconsulta: string | null;
    tipo: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        inicio: Date;
        fim: Date;
        link_teleconsulta: string | null;
        tipo: string;
      }[]
    >`
      SELECT id, inicio, fim, link_teleconsulta, tipo::text AS tipo
        FROM agendamentos
       WHERE uuid_externo = ${agendamentoUuid}::uuid
         AND paciente_id  = ${pacienteId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  // ────────────────────────────── Exames ──────────────────────────────

  async listExamesPaciente(params: {
    pacienteId: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ data: PortalExameRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;

    const baseWhere = Prisma.sql`s.paciente_id = ${params.pacienteId}::bigint`;

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*)::BIGINT AS total
            FROM solicitacoes_exame_itens i
            JOIN solicitacoes_exame      s ON s.id = i.solicitacao_id
           WHERE ${baseWhere}
        `,
      ),
      tx.$queryRaw<PortalExameRow[]>(
        Prisma.sql`
          SELECT
            s.uuid_externo::text  AS solicitacao_uuid,
            i.uuid_externo::text  AS item_uuid,
            tp.uuid_externo::text AS procedimento_uuid,
            tp.nome               AS procedimento_nome,
            i.status::text        AS status,
            s.data_solicitacao    AS data_solicitacao,
            re.uuid_externo::text AS resultado_uuid,
            re.status::text       AS resultado_status,
            (re.assinado_em IS NOT NULL) AS resultado_assinado
          FROM solicitacoes_exame_itens i
          JOIN solicitacoes_exame      s  ON s.id  = i.solicitacao_id
          JOIN tabelas_procedimentos   tp ON tp.id = i.procedimento_id
          LEFT JOIN resultados_exame   re ON re.id = i.resultado_id
          WHERE ${baseWhere}
          ORDER BY s.data_solicitacao DESC, i.id DESC
          LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async countExamesNovos(pacienteId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS total
        FROM resultados_exame r
       WHERE r.paciente_id = ${pacienteId}::bigint
         AND r.assinado_em IS NOT NULL
         AND r.created_at >= now() - INTERVAL '30 days'
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  async findResultadoPacienteByUuid(
    pacienteId: bigint,
    resultadoUuid: string,
  ): Promise<PortalResultadoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PortalResultadoRow[]>`
      SELECT
        r.uuid_externo::text AS uuid_externo,
        s.uuid_externo::text AS solicitacao_uuid,
        tp.uuid_externo::text AS procedimento_uuid,
        tp.nome               AS procedimento_nome,
        r.status::text        AS status,
        r.data_laudo,
        r.laudo_texto,
        r.laudo_pdf_url,
        r.imagens_urls,
        r.assinado_em
      FROM resultados_exame r
      JOIN solicitacoes_exame_itens si ON si.id = r.solicitacao_item_id
      JOIN solicitacoes_exame      s   ON s.id  = si.solicitacao_id
      JOIN tabelas_procedimentos   tp  ON tp.id = si.procedimento_id
      WHERE r.uuid_externo = ${resultadoUuid}::uuid
        AND r.paciente_id  = ${pacienteId}::bigint
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  // ────────────────────────────── Receitas ────────────────────────────

  async listReceitasPaciente(params: {
    pacienteId: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ data: PortalReceitaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;

    const baseWhere = Prisma.sql`
      d.paciente_id = ${params.pacienteId}::bigint
      AND d.tipo = 'RECEITA'::enum_documento_tipo
    `;

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM documentos_emitidos d WHERE ${baseWhere}`,
      ),
      tx.$queryRaw<PortalReceitaRow[]>(
        Prisma.sql`
          SELECT d.id, d.uuid_externo::text AS uuid_externo,
                 d.tipo::text AS tipo,
                 pr.nome      AS emissor_nome,
                 d.data_emissao, d.pdf_url, d.assinado_em
            FROM documentos_emitidos d
            LEFT JOIN prestadores pr ON pr.id = d.emissor_id
           WHERE ${baseWhere}
           ORDER BY d.data_emissao DESC, d.id DESC
           LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async findDocumentoPacienteByUuid(
    pacienteId: bigint,
    documentoUuid: string,
  ): Promise<{
    id: bigint;
    paciente_id: bigint;
    tipo: string;
    assinado_em: Date | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        paciente_id: bigint;
        tipo: string;
        assinado_em: Date | null;
      }[]
    >`
      SELECT id, paciente_id, tipo::text AS tipo, assinado_em
        FROM documentos_emitidos
       WHERE uuid_externo = ${documentoUuid}::uuid
         AND paciente_id  = ${pacienteId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  // ────────────────────────────── Contas ──────────────────────────────

  async listContasPaciente(params: {
    pacienteId: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ data: PortalContaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;

    const baseWhere = Prisma.sql`
      c.paciente_id = ${params.pacienteId}::bigint
      AND c.deleted_at IS NULL
    `;

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM contas c WHERE ${baseWhere}`,
      ),
      tx.$queryRaw<PortalContaRow[]>(
        Prisma.sql`
          SELECT c.id, c.uuid_externo::text AS uuid_externo,
                 c.numero_conta,
                 c.status::text AS status,
                 c.tipo_cobranca::text AS tipo_cobranca,
                 c.data_abertura, c.data_fechamento,
                 c.valor_total::text   AS valor_total,
                 c.valor_pago::text    AS valor_pago,
                 c.valor_liquido::text AS valor_liquido
            FROM contas c
           WHERE ${baseWhere}
           ORDER BY c.data_abertura DESC, c.id DESC
           LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async findContaPacienteByUuid(
    pacienteId: bigint,
    contaUuid: string,
  ): Promise<{ id: bigint; paciente_id: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; paciente_id: bigint }[]>`
      SELECT id, paciente_id
        FROM contas
       WHERE uuid_externo = ${contaUuid}::uuid
         AND paciente_id  = ${pacienteId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  // ────────────────────────────── Consentimentos ──────────────────────

  async listConsentimentosPaciente(
    pacienteId: bigint,
  ): Promise<PortalConsentimentoRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<PortalConsentimentoRow[]>`
      SELECT id, uuid_externo::text AS uuid_externo,
             finalidade::text AS finalidade,
             versao_termo, aceito, data_decisao,
             data_revogacao, motivo_revogacao
        FROM consentimentos_lgpd
       WHERE paciente_id = ${pacienteId}::bigint
       ORDER BY data_decisao DESC, id DESC
    `;
  }

  async findConsentimentoExistente(
    pacienteId: bigint,
    finalidade: string,
    versaoTermo: string,
  ): Promise<{ id: bigint; uuid_externo: string } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      SELECT id, uuid_externo::text AS uuid_externo
        FROM consentimentos_lgpd
       WHERE paciente_id = ${pacienteId}::bigint
         AND finalidade  = ${finalidade}::enum_consentimento_finalidade
         AND versao_termo = ${versaoTermo}
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async insertConsentimento(input: {
    tenantId: bigint;
    pacienteId: bigint;
    finalidade: string;
    versaoTermo: string;
    textoApresentado: string;
    aceito: boolean;
    ipOrigem: string | null;
    userAgent: string | null;
    createdBy: bigint;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO consentimentos_lgpd (
        tenant_id, paciente_id, finalidade, versao_termo,
        texto_apresentado, aceito, ip_origem, user_agent, created_by
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.finalidade}::enum_consentimento_finalidade,
        ${input.versaoTermo},
        ${input.textoApresentado},
        ${input.aceito},
        ${input.ipOrigem}::inet,
        ${input.userAgent},
        ${input.createdBy}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async findConsentimentoByUuid(
    pacienteId: bigint,
    uuid: string,
  ): Promise<{
    id: bigint;
    data_revogacao: Date | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; data_revogacao: Date | null }[]
    >`
      SELECT id, data_revogacao
        FROM consentimentos_lgpd
       WHERE uuid_externo = ${uuid}::uuid
         AND paciente_id  = ${pacienteId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async updateRevogacaoConsentimento(input: {
    id: bigint;
    motivo: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE consentimentos_lgpd
         SET data_revogacao   = now(),
             motivo_revogacao = ${input.motivo}
       WHERE id = ${input.id}::bigint
    `;
  }

  async countConsentimentosPendentes(pacienteId: bigint): Promise<number> {
    // "Pendente" aqui é uma heurística: paciente sem consentimento
    // ATIVO (aceito + sem revogação) na finalidade `TERMO_USO_PORTAL`.
    // Em produção, a contagem pode ser mais sofisticada (por finalidade
    // obrigatória).
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ exists_active: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM consentimentos_lgpd
         WHERE paciente_id = ${pacienteId}::bigint
           AND finalidade  = 'TERMO_USO_PORTAL'::enum_consentimento_finalidade
           AND aceito      = TRUE
           AND data_revogacao IS NULL
      ) AS exists_active
    `;
    return rows.length > 0 && rows[0].exists_active ? 0 : 1;
  }

  // ────────────────────────────── Notificações ────────────────────────

  async listNotificacoesPaciente(params: {
    pacienteId: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ data: PortalNotificacaoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;

    const baseWhere = Prisma.sql`paciente_id = ${params.pacienteId}::bigint`;

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM notificacoes_paciente WHERE ${baseWhere}`,
      ),
      tx.$queryRaw<PortalNotificacaoRow[]>(
        Prisma.sql`
          SELECT id, uuid_externo::text AS uuid_externo,
                 canal::text  AS canal,
                 assunto, conteudo,
                 status::text AS status,
                 data_envio, data_entrega, data_leitura,
                 template_codigo, origem_evento,
                 created_at
            FROM notificacoes_paciente
           WHERE ${baseWhere}
           ORDER BY created_at DESC, id DESC
           LIMIT ${params.pageSize}::int OFFSET ${offset}::int
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async countNotificacoesNaoLidas(pacienteId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS total
        FROM notificacoes_paciente
       WHERE paciente_id = ${pacienteId}::bigint
         AND status IN ('PENDENTE','ENVIADA','ENTREGUE')
         AND data_leitura IS NULL
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  async findNotificacaoByUuid(
    pacienteId: bigint,
    uuid: string,
  ): Promise<{
    id: bigint;
    status: string;
    data_leitura: Date | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; status: string; data_leitura: Date | null }[]
    >`
      SELECT id, status::text AS status, data_leitura
        FROM notificacoes_paciente
       WHERE uuid_externo = ${uuid}::uuid
         AND paciente_id  = ${pacienteId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async marcarNotificacaoLida(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE notificacoes_paciente
         SET status       = 'LIDA'::enum_notificacao_status,
             data_leitura = COALESCE(data_leitura, now())
       WHERE id = ${id}::bigint
    `;
  }
}
