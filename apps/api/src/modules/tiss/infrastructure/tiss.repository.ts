/**
 * `TissRepository` — fonte única de SQL do módulo TISS.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 *
 * Convenções:
 *   - Decimais sempre como string (`::text`) para evitar perda em float.
 *   - `versao_tiss_snapshot` da conta é a fonte da verdade
 *     (CLAUDE.md §7 #2). Caso esteja `NULL`, o use case deve fazer
 *     fallback via `findVersaoTissByConvenio`.
 *   - Inserts em `guias_tiss` / `lotes_tiss` ficam protegidos pelas
 *     triggers `tg_guia_tiss_imutavel` / `tg_lote_tiss_imutavel` —
 *     este repositório NÃO bypassa esses gates.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  GuiaTissStatus,
  GuiaTissTipo,
  ValidacaoXsdStatus,
} from '../domain/guia-tiss';
import type { LoteTissStatus } from '../domain/lote-tiss';

// ─────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────

export interface ContaSnapshotRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  numero_conta: string;
  status: string;
  tipo_cobranca: string;
  atendimento_id: bigint;
  paciente_id: bigint;
  convenio_id: bigint | null;
  plano_id: bigint | null;
  numero_guia_principal: string | null;
  versao_tiss_snapshot: string | null;
  valor_total: string;
  // Atendimento snapshot:
  atendimento_uuid: string;
  atendimento_data_entrada: Date;
  atendimento_data_saida: Date | null;
  numero_carteirinha: string | null;
  numero_guia_operadora: string | null;
  senha_autorizacao: string | null;
  // Paciente snapshot:
  paciente_uuid: string;
  paciente_nome: string;
  // Convênio snapshot:
  convenio_uuid: string | null;
  convenio_nome: string | null;
  convenio_registro_ans: string | null;
  convenio_versao_tiss: string | null;
  // Plano snapshot:
  plano_nome: string | null;
  // Tenant (prestador / hospital):
  tenant_nome: string | null;
  tenant_cnpj: string | null;
  tenant_registro_ans: string | null;
}

export interface ContaItemForGuiaRow {
  id: bigint;
  uuid_externo: string;
  conta_id: bigint;
  procedimento_id: bigint;
  procedimento_codigo_tuss: string | null;
  procedimento_nome: string | null;
  procedimento_tabela: string | null;
  grupo_gasto: string;
  origem: string;
  origem_referencia_id: bigint | null;
  origem_referencia_tipo: string | null;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  data_realizacao: Date | null;
  lote: string | null;
  registro_anvisa: string | null;
  fabricante: string | null;
  tabela_tiss_origem: string | null;
  guia_tiss_id: bigint | null;
  prestador_executante_id: bigint | null;
  prestador_executante_nome: string | null;
  // Honorário (vindo de cirurgia):
  cirurgia_funcao: string | null;
}

export interface GuiaTissRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  conta_id: bigint;
  conta_uuid: string;
  lote_id: bigint | null;
  lote_uuid: string | null;
  tipo_guia: GuiaTissTipo;
  versao_tiss: string;
  numero_guia_prestador: string;
  numero_guia_operadora: string | null;
  senha_autorizacao: string | null;
  hash_xml: string | null;
  valor_total: string;
  status: GuiaTissStatus;
  validacao_xsd_status: ValidacaoXsdStatus | null;
  validacao_xsd_erros: unknown | null;
  data_geracao: Date;
  data_validacao: Date | null;
  data_envio: Date | null;
  data_resposta: Date | null;
  motivo_recusa: string | null;
  created_at: Date;
}

export interface GuiaTissXmlRow extends GuiaTissRow {
  xml_conteudo: string | null;
}

export interface LoteTissRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  convenio_id: bigint;
  convenio_uuid: string;
  convenio_nome: string;
  convenio_registro_ans: string | null;
  numero_lote: string;
  versao_tiss: string;
  competencia: string;
  data_geracao: Date;
  data_validacao: Date | null;
  data_envio: Date | null;
  data_processamento: Date | null;
  qtd_guias: number;
  valor_total: string;
  hash_xml: string | null;
  xml_url: string | null;
  protocolo_operadora: string | null;
  status: LoteTissStatus;
  validacao_xsd_erros: unknown | null;
  lote_anterior_id: bigint | null;
  lote_anterior_uuid: string | null;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
}

// ─────────────────────────────────────────────────────────────────
// Insert / Update args
// ─────────────────────────────────────────────────────────────────

export interface InsertGuiaArgs {
  tenantId: bigint;
  contaId: bigint;
  tipo: GuiaTissTipo;
  versaoTiss: string;
  numeroGuiaPrestador: string;
  numeroGuiaOperadora: string | null;
  senhaAutorizacao: string | null;
  xmlConteudo: string;
  hashXml: string;
  valorTotal: string;
  validacaoStatus: ValidacaoXsdStatus;
  validacaoErros: unknown[] | null;
  userId: bigint;
}

export interface InsertLoteArgs {
  tenantId: bigint;
  convenioId: bigint;
  numeroLote: string;
  versaoTiss: string;
  competencia: string; // YYYY-MM
  qtdGuias: number;
  valorTotal: string;
  loteAnteriorId: bigint | null;
  observacao: string | null;
  userId: bigint;
}

// ─────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class TissRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups: conta + snapshots ──────────

  /**
   * Busca a conta com tudo que o builder TISS precisa: paciente, conv,
   * plano, atendimento, tenant. Retorna `null` se não existir.
   */
  async findContaByUuid(uuid: string): Promise<ContaSnapshotRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ContaSnapshotRow[]>`
      SELECT
        c.id,
        c.uuid_externo::text                AS uuid_externo,
        c.tenant_id,
        c.numero_conta,
        c.status::text                      AS status,
        c.tipo_cobranca::text               AS tipo_cobranca,
        c.atendimento_id,
        c.paciente_id,
        c.convenio_id,
        c.plano_id,
        c.numero_guia_principal,
        c.versao_tiss_snapshot,
        c.valor_total::text                 AS valor_total,
        a.uuid_externo::text                AS atendimento_uuid,
        a.data_hora_entrada                 AS atendimento_data_entrada,
        a.data_hora_saida                   AS atendimento_data_saida,
        a.numero_carteirinha,
        a.numero_guia_operadora,
        a.senha_autorizacao,
        p.uuid_externo::text                AS paciente_uuid,
        p.nome                              AS paciente_nome,
        cv.uuid_externo::text               AS convenio_uuid,
        cv.nome                             AS convenio_nome,
        cv.registro_ans                     AS convenio_registro_ans,
        cv.versao_tiss                      AS convenio_versao_tiss,
        pl.nome                             AS plano_nome,
        t.razao_social                      AS tenant_nome,
        t.cnpj                              AS tenant_cnpj,
        t.registro_ans                      AS tenant_registro_ans
      FROM contas c
      JOIN atendimentos a ON a.id = c.atendimento_id
      JOIN pacientes    p ON p.id = c.paciente_id
      LEFT JOIN convenios cv ON cv.id = c.convenio_id
      LEFT JOIN planos    pl ON pl.id = c.plano_id
      JOIN tenants      t  ON t.id  = c.tenant_id
      WHERE c.uuid_externo = ${uuid}::uuid
        AND c.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Fallback quando `versao_tiss_snapshot` da conta está nulo (conta
   * ainda não foi fechada). Usa a versão atual cadastrada no convênio.
   */
  async findVersaoTissByConvenio(convenioId: bigint): Promise<string | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ versao_tiss: string }[]>`
      SELECT versao_tiss FROM convenios
       WHERE id = ${convenioId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].versao_tiss;
  }

  /**
   * Itens da conta filtrados pelo tipo de guia que vai recebê-los.
   * Quem decide a filtragem é o builder, mas centralizamos a SQL aqui
   * para não duplicar JOIN com tabelas_procedimentos / cirurgias_equipe.
   *
   * - tipo='CONSULTA' / 'SP_SADT' / 'INTERNACAO' / 'OUTRAS_DESPESAS' /
   *   'ANEXO_OPME' filtram por `grupo_gasto` (lista passada em `grupos`).
   * - tipo='HONORARIOS' adicionalmente puxa `cirurgia_funcao` via
   *   `cirurgias_equipe` quando `origem='CIRURGIA'`.
   *
   * O argumento `incluirComGuia` controla se itens já vinculados a
   * outra guia (`guia_tiss_id IS NOT NULL`) devem aparecer; default
   * `false` (RN-FAT-04: 1 item → 1 guia).
   */
  async findContaItensByConta(args: {
    contaId: bigint;
    grupos: string[];
    incluirComGuia?: boolean;
  }): Promise<ContaItemForGuiaRow[]> {
    const tx = this.prisma.tx();
    const incluirComGuia = args.incluirComGuia === true;
    const rows = await tx.$queryRaw<ContaItemForGuiaRow[]>`
      SELECT
        ci.id,
        ci.uuid_externo::text         AS uuid_externo,
        ci.conta_id,
        ci.procedimento_id,
        tp.codigo_tuss                AS procedimento_codigo_tuss,
        tp.nome                       AS procedimento_nome,
        tp.tabela_tiss                AS procedimento_tabela,
        ci.grupo_gasto::text          AS grupo_gasto,
        ci.origem::text               AS origem,
        ci.origem_referencia_id,
        ci.origem_referencia_tipo,
        ci.quantidade::text           AS quantidade,
        ci.valor_unitario::text       AS valor_unitario,
        ci.valor_total::text          AS valor_total,
        ci.data_realizacao,
        ci.lote,
        ci.registro_anvisa,
        ci.fabricante,
        ci.tabela_tiss_origem,
        ci.guia_tiss_id,
        ci.prestador_executante_id,
        pe.nome                       AS prestador_executante_nome,
        ce.funcao                     AS cirurgia_funcao
      FROM contas_itens ci
      JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
      LEFT JOIN prestadores       pe ON pe.id = ci.prestador_executante_id
      LEFT JOIN cirurgias_equipe  ce ON ce.conta_item_id = ci.id
      WHERE ci.conta_id = ${args.contaId}::bigint
        AND ci.deleted_at IS NULL
        AND ci.grupo_gasto::text = ANY(${args.grupos}::text[])
        AND (${incluirComGuia}::bool = TRUE OR ci.guia_tiss_id IS NULL)
      ORDER BY ci.id ASC
    `;
    return rows;
  }

  // ────────── Guias ──────────

  async findGuiasByConta(contaId: bigint): Promise<GuiaTissRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GuiaTissRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE g.conta_id = ${contaId}::bigint
       ORDER BY g.id ASC
    `;
    return rows;
  }

  async findGuiaByUuid(uuid: string): Promise<GuiaTissRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GuiaTissRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE g.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Mesma query de `findGuiaByUuid` + `xml_conteudo` (separado porque é
   * grande — só carregamos quando o cliente explicitamente pede o XML).
   */
  async findGuiaByUuidWithXml(uuid: string): Promise<GuiaTissXmlRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GuiaTissXmlRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.xml_conteudo,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE g.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findGuiasByLote(loteId: bigint): Promise<GuiaTissRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GuiaTissRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE g.lote_id = ${loteId}::bigint
       ORDER BY g.id ASC
    `;
    return rows;
  }

  /** Versão "leve" para o lote builder: só XML + dados de cabeçalho. */
  async findGuiasByLoteWithXml(loteId: bigint): Promise<GuiaTissXmlRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GuiaTissXmlRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.xml_conteudo,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE g.lote_id = ${loteId}::bigint
       ORDER BY g.id ASC
    `;
    return rows;
  }

  async listGuias(args: {
    contaId?: bigint;
    statuses?: GuiaTissStatus[];
    tipoGuia?: GuiaTissTipo;
    loteId?: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ rows: GuiaTissRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const contaFilter = args.contaId ?? null;
    const statusesFilter = args.statuses ?? null;
    const tipoFilter = args.tipoGuia ?? null;
    const loteFilter = args.loteId ?? null;

    const rows = await tx.$queryRaw<GuiaTissRow[]>`
      SELECT g.id,
             g.uuid_externo::text    AS uuid_externo,
             g.tenant_id,
             g.conta_id,
             c.uuid_externo::text    AS conta_uuid,
             g.lote_id,
             l.uuid_externo::text    AS lote_uuid,
             g.tipo_guia::text       AS tipo_guia,
             g.versao_tiss,
             g.numero_guia_prestador,
             g.numero_guia_operadora,
             g.senha_autorizacao,
             g.hash_xml,
             g.valor_total::text     AS valor_total,
             g.status::text          AS status,
             g.validacao_xsd_status,
             g.validacao_xsd_erros,
             g.data_geracao,
             g.data_validacao,
             g.data_envio,
             g.data_resposta,
             g.motivo_recusa,
             g.created_at
        FROM guias_tiss g
        JOIN contas c       ON c.id = g.conta_id
        LEFT JOIN lotes_tiss l ON l.id = g.lote_id
       WHERE (${contaFilter}::bigint IS NULL OR g.conta_id = ${contaFilter}::bigint)
         AND (${statusesFilter}::text[] IS NULL
              OR g.status::text = ANY(${statusesFilter}::text[]))
         AND (${tipoFilter}::text IS NULL OR g.tipo_guia::text = ${tipoFilter}::text)
         AND (${loteFilter}::bigint IS NULL OR g.lote_id = ${loteFilter}::bigint)
       ORDER BY g.data_geracao DESC, g.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM guias_tiss g
       WHERE (${contaFilter}::bigint IS NULL OR g.conta_id = ${contaFilter}::bigint)
         AND (${statusesFilter}::text[] IS NULL
              OR g.status::text = ANY(${statusesFilter}::text[]))
         AND (${tipoFilter}::text IS NULL OR g.tipo_guia::text = ${tipoFilter}::text)
         AND (${loteFilter}::bigint IS NULL OR g.lote_id = ${loteFilter}::bigint)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async insertGuia(args: InsertGuiaArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const errosJson =
      args.validacaoErros === null
        ? null
        : JSON.stringify(args.validacaoErros);
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO guias_tiss (
        tenant_id, conta_id, tipo_guia, versao_tiss,
        numero_guia_prestador, numero_guia_operadora, senha_autorizacao,
        xml_conteudo, hash_xml, valor_total, status,
        validacao_xsd_status, validacao_xsd_erros, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.contaId}::bigint,
        ${args.tipo}::enum_guia_tiss_tipo,
        ${args.versaoTiss},
        ${args.numeroGuiaPrestador},
        ${args.numeroGuiaOperadora},
        ${args.senhaAutorizacao},
        ${args.xmlConteudo},
        ${args.hashXml},
        ${args.valorTotal}::numeric,
        'GERADA'::enum_guia_tiss_status,
        ${args.validacaoStatus},
        ${errosJson}::jsonb,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT guias_tiss não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  /**
   * Vincula um conjunto de itens de conta à guia recém-criada.
   * Não pode ser feito em uma guia imutável — a trigger DB bloqueia se
   * tentar.
   */
  async attachItensToGuia(
    guiaId: bigint,
    itensIds: bigint[],
  ): Promise<void> {
    if (itensIds.length === 0) return;
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas_itens
         SET guia_tiss_id = ${guiaId}::bigint,
             updated_at   = now()
       WHERE id = ANY(${itensIds}::bigint[])
    `;
  }

  async updateGuiaStatus(args: {
    id: bigint;
    status: GuiaTissStatus;
    dataValidacao?: Date | null;
    dataEnvio?: Date | null;
    dataResposta?: Date | null;
    motivoRecusa?: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const dataValidacao = args.dataValidacao ?? null;
    const dataEnvio = args.dataEnvio ?? null;
    const dataResposta = args.dataResposta ?? null;
    const motivo = args.motivoRecusa ?? null;
    await tx.$executeRaw`
      UPDATE guias_tiss
         SET status = ${args.status}::enum_guia_tiss_status,
             data_validacao = COALESCE(${dataValidacao}::timestamptz, data_validacao),
             data_envio     = COALESCE(${dataEnvio}::timestamptz, data_envio),
             data_resposta  = COALESCE(${dataResposta}::timestamptz, data_resposta),
             motivo_recusa  = COALESCE(${motivo}, motivo_recusa)
       WHERE id = ${args.id}::bigint
    `;
  }

  async attachGuiaToLote(guiaId: bigint, loteId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE guias_tiss
         SET lote_id = ${loteId}::bigint
       WHERE id = ${guiaId}::bigint
    `;
  }

  async detachGuiasFromLote(loteId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE guias_tiss
         SET lote_id = NULL
       WHERE lote_id = ${loteId}::bigint
    `;
  }

  // ────────── Lotes ──────────

  async findLoteByUuid(uuid: string): Promise<LoteTissRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<LoteTissRow[]>`
      SELECT l.id,
             l.uuid_externo::text       AS uuid_externo,
             l.tenant_id,
             l.convenio_id,
             cv.uuid_externo::text      AS convenio_uuid,
             cv.nome                    AS convenio_nome,
             cv.registro_ans            AS convenio_registro_ans,
             l.numero_lote,
             l.versao_tiss,
             l.competencia,
             l.data_geracao,
             l.data_validacao,
             l.data_envio,
             l.data_processamento,
             l.qtd_guias,
             l.valor_total::text        AS valor_total,
             l.hash_xml,
             l.xml_url,
             l.protocolo_operadora,
             l.status::text             AS status,
             l.validacao_xsd_erros,
             l.lote_anterior_id,
             la.uuid_externo::text      AS lote_anterior_uuid,
             l.observacao,
             l.created_at,
             l.updated_at
        FROM lotes_tiss l
        JOIN convenios cv ON cv.id = l.convenio_id
        LEFT JOIN lotes_tiss la ON la.id = l.lote_anterior_id
       WHERE l.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findLoteAnteriorByUuid(uuid: string): Promise<{
    id: bigint;
    convenioId: bigint;
    competencia: string;
    versaoTiss: string;
    status: LoteTissStatus;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        convenio_id: bigint;
        competencia: string;
        versao_tiss: string;
        status: LoteTissStatus;
      }[]
    >`
      SELECT id, convenio_id, competencia, versao_tiss,
             status::text AS status
        FROM lotes_tiss
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      convenioId: rows[0].convenio_id,
      competencia: rows[0].competencia,
      versaoTiss: rows[0].versao_tiss,
      status: rows[0].status,
    };
  }

  async listLotes(args: {
    statuses?: LoteTissStatus[];
    convenioId?: bigint;
    competencia?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: LoteTissRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusesFilter = args.statuses ?? null;
    const convenioFilter = args.convenioId ?? null;
    const competenciaFilter = args.competencia ?? null;

    const rows = await tx.$queryRaw<LoteTissRow[]>`
      SELECT l.id,
             l.uuid_externo::text       AS uuid_externo,
             l.tenant_id,
             l.convenio_id,
             cv.uuid_externo::text      AS convenio_uuid,
             cv.nome                    AS convenio_nome,
             cv.registro_ans            AS convenio_registro_ans,
             l.numero_lote,
             l.versao_tiss,
             l.competencia,
             l.data_geracao,
             l.data_validacao,
             l.data_envio,
             l.data_processamento,
             l.qtd_guias,
             l.valor_total::text        AS valor_total,
             l.hash_xml,
             l.xml_url,
             l.protocolo_operadora,
             l.status::text             AS status,
             l.validacao_xsd_erros,
             l.lote_anterior_id,
             la.uuid_externo::text      AS lote_anterior_uuid,
             l.observacao,
             l.created_at,
             l.updated_at
        FROM lotes_tiss l
        JOIN convenios cv ON cv.id = l.convenio_id
        LEFT JOIN lotes_tiss la ON la.id = l.lote_anterior_id
       WHERE (${statusesFilter}::text[] IS NULL
              OR l.status::text = ANY(${statusesFilter}::text[]))
         AND (${convenioFilter}::bigint IS NULL
              OR l.convenio_id = ${convenioFilter}::bigint)
         AND (${competenciaFilter}::text IS NULL
              OR l.competencia = ${competenciaFilter}::text)
       ORDER BY l.data_geracao DESC, l.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM lotes_tiss l
       WHERE (${statusesFilter}::text[] IS NULL
              OR l.status::text = ANY(${statusesFilter}::text[]))
         AND (${convenioFilter}::bigint IS NULL
              OR l.convenio_id = ${convenioFilter}::bigint)
         AND (${competenciaFilter}::text IS NULL
              OR l.competencia = ${competenciaFilter}::text)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async insertLote(args: InsertLoteArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO lotes_tiss (
        tenant_id, convenio_id, numero_lote, versao_tiss, competencia,
        qtd_guias, valor_total, status,
        lote_anterior_id, observacao, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.convenioId}::bigint,
        ${args.numeroLote},
        ${args.versaoTiss},
        ${args.competencia},
        ${args.qtdGuias}::int,
        ${args.valorTotal}::numeric,
        'GERADO'::enum_lote_tiss_status,
        ${args.loteAnteriorId}::bigint,
        ${args.observacao},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT lotes_tiss não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateLoteStatus(args: {
    id: bigint;
    status: LoteTissStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE lotes_tiss
         SET status     = ${args.status}::enum_lote_tiss_status,
             updated_at = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateLoteValidacao(args: {
    id: bigint;
    status: LoteTissStatus;
    erros: unknown[] | null;
    hashXml: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const errosJson = args.erros === null ? null : JSON.stringify(args.erros);
    const hash = args.hashXml ?? null;
    await tx.$executeRaw`
      UPDATE lotes_tiss
         SET status              = ${args.status}::enum_lote_tiss_status,
             validacao_xsd_erros = ${errosJson}::jsonb,
             hash_xml            = COALESCE(${hash}, hash_xml),
             data_validacao      = now(),
             updated_at          = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateLoteEnvio(args: {
    id: bigint;
    xmlUrl: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const xmlUrl = args.xmlUrl ?? null;
    await tx.$executeRaw`
      UPDATE lotes_tiss
         SET status     = 'ENVIADO'::enum_lote_tiss_status,
             data_envio = now(),
             xml_url    = COALESCE(${xmlUrl}, xml_url),
             updated_at = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateLoteProtocolo(args: {
    id: bigint;
    protocolo: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE lotes_tiss
         SET status              = 'PROCESSADO'::enum_lote_tiss_status,
             protocolo_operadora = ${args.protocolo},
             data_processamento  = now(),
             updated_at          = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  /**
   * Calcula o próximo número de lote para o convênio na competência:
   * `MAX(numero_lote::int) + 1`, formatado em 4 dígitos com zeros à
   * esquerda (`'0001'`, `'0042'`...).
   *
   * O cast para int só funciona se todos os números antigos forem
   * numéricos. Caso encontre algo não-numérico, faz fallback para 1.
   */
  async getNextNumeroLote(args: {
    tenantId: bigint;
    convenioId: bigint;
    competencia: string;
  }): Promise<string> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ proximo: number | null }[]>`
      SELECT COALESCE(
               MAX(
                 CASE WHEN numero_lote ~ '^[0-9]+$' THEN numero_lote::int
                      ELSE NULL END
               ),
               0
             ) + 1 AS proximo
        FROM lotes_tiss
       WHERE tenant_id   = ${args.tenantId}::bigint
         AND convenio_id = ${args.convenioId}::bigint
         AND competencia = ${args.competencia}
    `;
    const proximo = rows.length === 0 || rows[0].proximo === null ? 1 : Number(rows[0].proximo);
    return String(proximo).padStart(4, '0');
  }

  // ────────── Resolução de UUIDs auxiliares ──────────

  async findConvenioIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM convenios
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }
}
