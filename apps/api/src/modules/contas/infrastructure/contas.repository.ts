/**
 * `ContasRepository` — fonte única de SQL do módulo Contas.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 *
 * Convenções:
 *   - Escritas em `contas_itens` disparam a trigger `tg_atualiza_totais_conta`
 *     que recalcula `contas.valor_*` automaticamente — não atualizamos
 *     totais manualmente.
 *   - Snapshots (versão TISS, condição contratual, tabela de preços)
 *     gravados como JSONB no fechamento (RN-FAT-02).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type { ContaStatus, TipoCobranca } from '../domain/conta';
import type { Inconsistencia } from '../domain/inconsistencia';
import type { GrupoGastoDto } from '../dto/lancar-item.dto';

export interface ContaRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  numero_conta: string;
  status: ContaStatus;
  tipo_cobranca: TipoCobranca;
  atendimento_id: bigint;
  atendimento_uuid: string;
  paciente_id: bigint;
  paciente_uuid: string;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  plano_id: bigint | null;
  plano_uuid: string | null;
  data_abertura: Date;
  data_fechamento: Date | null;
  data_envio: Date | null;
  data_elaboracao_inicio: Date | null;
  data_elaboracao_fim: Date | null;
  numero_guia_principal: string | null;
  observacao_elaboracao: string | null;
  valor_procedimentos: string;
  valor_diarias: string;
  valor_taxas: string;
  valor_servicos: string;
  valor_materiais: string;
  valor_medicamentos: string;
  valor_opme: string;
  valor_gases: string;
  valor_pacotes: string;
  valor_honorarios: string;
  valor_total: string;
  valor_glosa: string;
  valor_recurso_revertido: string;
  valor_pago: string;
  valor_liquido: string;
  iss_aliquota_snap: string | null;
  iss_valor: string | null;
  iss_retem: boolean;
  versao_tiss_snapshot: string | null;
  condicao_contratual_snap: unknown | null;
  tabela_precos_snap: unknown | null;
  inconsistencias: unknown | null;
  versao: number;
}

export interface ContaItemRow {
  id: bigint;
  uuid_externo: string;
  conta_id: bigint;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  procedimento_codigo_tuss: string | null;
  procedimento_grupo_gasto: GrupoGastoDto;
  grupo_gasto: GrupoGastoDto;
  origem: string;
  origem_referencia_id: bigint | null;
  origem_referencia_tipo: string | null;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  prestador_executante_id: bigint | null;
  prestador_executante_uuid: string | null;
  prestador_executante_nome: string | null;
  setor_id: bigint | null;
  setor_uuid: string | null;
  setor_nome: string | null;
  data_realizacao: Date | null;
  autorizado: boolean;
  numero_autorizacao: string | null;
  fora_pacote: boolean;
  pacote_id: bigint | null;
  pacote_uuid: string | null;
  lote: string | null;
  validade_lote: Date | null;
  registro_anvisa: string | null;
  fabricante: string | null;
  glosado: boolean;
  valor_glosa: string;
  guia_tiss_id: bigint | null;
  guia_tiss_uuid: string | null;
  tabela_tiss_origem: string | null;
}

export interface InsertContaItemArgs {
  tenantId: bigint;
  contaId: bigint;
  procedimentoId: bigint;
  grupoGasto: GrupoGastoDto;
  origem: string; // enum_conta_origem_item
  origemReferenciaId: bigint | null;
  origemReferenciaTipo: string;
  quantidade: string; // numeric
  valorUnitario: string; // numeric
  valorTotal: string; // numeric
  prestadorExecutanteId: bigint | null;
  setorId: bigint | null;
  dataRealizacao: string | null;
  autorizado: boolean;
  numeroAutorizacao: string | null;
  foraPacote: boolean;
  pacoteId: bigint | null;
  lote: string | null;
  validadeLote: string | null;
  registroAnvisa: string | null;
  fabricante: string | null;
  userId: bigint;
}

export interface SnapshotPayload {
  versaoTiss: string | null;
  condicaoContratual: unknown;
  tabelaPrecos: unknown;
  issAliquota: string | null;
  issRetem: boolean;
  issValor: string | null;
}

@Injectable()
export class ContasRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

  async findContaByUuid(uuid: string): Promise<ContaRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ContaRow[]>`
      SELECT
        c.id, c.uuid_externo::text AS uuid_externo, c.tenant_id, c.numero_conta,
        c.status::text AS status, c.tipo_cobranca::text AS tipo_cobranca,
        c.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        c.paciente_id,    p.uuid_externo::text AS paciente_uuid,
        c.convenio_id,    cv.uuid_externo::text AS convenio_uuid,
        c.plano_id,       pl.uuid_externo::text AS plano_uuid,
        c.data_abertura, c.data_fechamento, c.data_envio,
        c.data_elaboracao_inicio, c.data_elaboracao_fim,
        c.numero_guia_principal, c.observacao_elaboracao,
        c.valor_procedimentos::text AS valor_procedimentos,
        c.valor_diarias::text       AS valor_diarias,
        c.valor_taxas::text         AS valor_taxas,
        c.valor_servicos::text      AS valor_servicos,
        c.valor_materiais::text     AS valor_materiais,
        c.valor_medicamentos::text  AS valor_medicamentos,
        c.valor_opme::text          AS valor_opme,
        c.valor_gases::text         AS valor_gases,
        c.valor_pacotes::text       AS valor_pacotes,
        c.valor_honorarios::text    AS valor_honorarios,
        c.valor_total::text         AS valor_total,
        c.valor_glosa::text         AS valor_glosa,
        c.valor_recurso_revertido::text AS valor_recurso_revertido,
        c.valor_pago::text          AS valor_pago,
        c.valor_liquido::text       AS valor_liquido,
        c.iss_aliquota_snap::text   AS iss_aliquota_snap,
        c.iss_valor::text           AS iss_valor,
        c.iss_retem,
        c.versao_tiss_snapshot,
        c.condicao_contratual_snap,
        c.tabela_precos_snap,
        c.inconsistencias,
        c.versao
      FROM contas c
      JOIN atendimentos a ON a.id = c.atendimento_id
      JOIN pacientes    p ON p.id = c.paciente_id
      LEFT JOIN convenios cv ON cv.id = c.convenio_id
      LEFT JOIN planos    pl ON pl.id = c.plano_id
      WHERE c.uuid_externo = ${uuid}::uuid
        AND c.deleted_at IS NULL
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findContaIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM contas
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async listContas(args: {
    statuses?: ContaStatus[];
    pacienteId?: bigint;
    atendimentoId?: bigint;
    convenioId?: bigint;
    dataInicio?: string;
    dataFim?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: ContaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statuses = args.statuses ?? null;
    const pacienteId = args.pacienteId ?? null;
    const atendimentoId = args.atendimentoId ?? null;
    const convenioId = args.convenioId ?? null;
    const dataInicio = args.dataInicio ?? null;
    const dataFim = args.dataFim ?? null;

    const rows = await tx.$queryRaw<ContaRow[]>`
      SELECT
        c.id, c.uuid_externo::text AS uuid_externo, c.tenant_id, c.numero_conta,
        c.status::text AS status, c.tipo_cobranca::text AS tipo_cobranca,
        c.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        c.paciente_id,    p.uuid_externo::text AS paciente_uuid,
        c.convenio_id,    cv.uuid_externo::text AS convenio_uuid,
        c.plano_id,       pl.uuid_externo::text AS plano_uuid,
        c.data_abertura, c.data_fechamento, c.data_envio,
        c.data_elaboracao_inicio, c.data_elaboracao_fim,
        c.numero_guia_principal, c.observacao_elaboracao,
        c.valor_procedimentos::text AS valor_procedimentos,
        c.valor_diarias::text       AS valor_diarias,
        c.valor_taxas::text         AS valor_taxas,
        c.valor_servicos::text      AS valor_servicos,
        c.valor_materiais::text     AS valor_materiais,
        c.valor_medicamentos::text  AS valor_medicamentos,
        c.valor_opme::text          AS valor_opme,
        c.valor_gases::text         AS valor_gases,
        c.valor_pacotes::text       AS valor_pacotes,
        c.valor_honorarios::text    AS valor_honorarios,
        c.valor_total::text         AS valor_total,
        c.valor_glosa::text         AS valor_glosa,
        c.valor_recurso_revertido::text AS valor_recurso_revertido,
        c.valor_pago::text          AS valor_pago,
        c.valor_liquido::text       AS valor_liquido,
        c.iss_aliquota_snap::text   AS iss_aliquota_snap,
        c.iss_valor::text           AS iss_valor,
        c.iss_retem,
        c.versao_tiss_snapshot,
        c.condicao_contratual_snap,
        c.tabela_precos_snap,
        c.inconsistencias,
        c.versao
      FROM contas c
      JOIN atendimentos a ON a.id = c.atendimento_id
      JOIN pacientes    p ON p.id = c.paciente_id
      LEFT JOIN convenios cv ON cv.id = c.convenio_id
      LEFT JOIN planos    pl ON pl.id = c.plano_id
      WHERE c.deleted_at IS NULL
        AND (${statuses}::text[] IS NULL OR c.status::text = ANY(${statuses}::text[]))
        AND (${pacienteId}::bigint IS NULL OR c.paciente_id = ${pacienteId}::bigint)
        AND (${atendimentoId}::bigint IS NULL OR c.atendimento_id = ${atendimentoId}::bigint)
        AND (${convenioId}::bigint IS NULL OR c.convenio_id = ${convenioId}::bigint)
        AND (${dataInicio}::timestamptz IS NULL OR c.data_abertura >= ${dataInicio}::timestamptz)
        AND (${dataFim}::timestamptz   IS NULL OR c.data_abertura <  ${dataFim}::timestamptz)
      ORDER BY c.data_abertura DESC, c.id DESC
      LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM contas c
       WHERE c.deleted_at IS NULL
         AND (${statuses}::text[] IS NULL OR c.status::text = ANY(${statuses}::text[]))
         AND (${pacienteId}::bigint IS NULL OR c.paciente_id = ${pacienteId}::bigint)
         AND (${atendimentoId}::bigint IS NULL OR c.atendimento_id = ${atendimentoId}::bigint)
         AND (${convenioId}::bigint IS NULL OR c.convenio_id = ${convenioId}::bigint)
         AND (${dataInicio}::timestamptz IS NULL OR c.data_abertura >= ${dataInicio}::timestamptz)
         AND (${dataFim}::timestamptz   IS NULL OR c.data_abertura <  ${dataFim}::timestamptz)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async findItensByContaId(contaId: bigint): Promise<ContaItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ContaItemRow[]>`
      SELECT
        ci.id,
        ci.uuid_externo::text AS uuid_externo,
        ci.conta_id,
        ci.procedimento_id,
        tp.uuid_externo::text   AS procedimento_uuid,
        tp.nome                 AS procedimento_nome,
        tp.codigo_tuss          AS procedimento_codigo_tuss,
        tp.grupo_gasto::text    AS procedimento_grupo_gasto,
        ci.grupo_gasto::text    AS grupo_gasto,
        ci.origem::text         AS origem,
        ci.origem_referencia_id,
        ci.origem_referencia_tipo,
        ci.quantidade::text     AS quantidade,
        ci.valor_unitario::text AS valor_unitario,
        ci.valor_total::text    AS valor_total,
        ci.prestador_executante_id,
        pe.uuid_externo::text   AS prestador_executante_uuid,
        pe.nome                 AS prestador_executante_nome,
        ci.setor_id,
        s.uuid_externo::text    AS setor_uuid,
        s.nome                  AS setor_nome,
        ci.data_realizacao,
        ci.autorizado,
        ci.numero_autorizacao,
        ci.fora_pacote,
        ci.pacote_id,
        pa.uuid_externo::text   AS pacote_uuid,
        ci.lote,
        ci.validade_lote,
        ci.registro_anvisa,
        ci.fabricante,
        ci.glosado,
        ci.valor_glosa::text    AS valor_glosa,
        ci.guia_tiss_id,
        gt.uuid_externo::text   AS guia_tiss_uuid,
        ci.tabela_tiss_origem
      FROM contas_itens ci
      JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
      LEFT JOIN prestadores pe ON pe.id = ci.prestador_executante_id
      LEFT JOIN setores     s  ON s.id  = ci.setor_id
      LEFT JOIN pacotes     pa ON pa.id = ci.pacote_id
      LEFT JOIN guias_tiss  gt ON gt.id = ci.guia_tiss_id
      WHERE ci.conta_id = ${contaId}::bigint
        AND ci.deleted_at IS NULL
      ORDER BY ci.id ASC
    `;
    return rows;
  }

  async findItemByUuid(uuid: string): Promise<{
    id: bigint;
    contaId: bigint;
    valorTotal: string;
    grupoGasto: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        conta_id: bigint;
        valor_total: string;
        grupo_gasto: string;
      }[]
    >`
      SELECT id, conta_id, valor_total::text AS valor_total,
             grupo_gasto::text AS grupo_gasto
        FROM contas_itens
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      contaId: rows[0].conta_id,
      valorTotal: rows[0].valor_total,
      grupoGasto: rows[0].grupo_gasto,
    };
  }

  // ────────── Resolução de UUIDs auxiliares ──────────

  async findProcedimentoByUuid(uuid: string): Promise<{
    id: bigint;
    grupoGasto: string;
    nome: string | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; grupo_gasto: string; nome: string | null }[]
    >`
      SELECT id, grupo_gasto::text AS grupo_gasto, nome
        FROM tabelas_procedimentos
       WHERE uuid_externo = ${uuid}::uuid AND ativo = TRUE
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      grupoGasto: rows[0].grupo_gasto,
      nome: rows[0].nome,
    };
  }

  async findProcedimentosByUuids(uuids: string[]): Promise<
    Map<string, { id: bigint; grupoGasto: string; nome: string | null }>
  > {
    const out = new Map<
      string,
      { id: bigint; grupoGasto: string; nome: string | null }
    >();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        uuid_externo: string;
        grupo_gasto: string;
        nome: string | null;
      }[]
    >`
      SELECT id, uuid_externo::text AS uuid_externo,
             grupo_gasto::text AS grupo_gasto, nome
        FROM tabelas_procedimentos
       WHERE uuid_externo = ANY(${uuids}::uuid[])
         AND ativo = TRUE
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, {
        id: r.id,
        grupoGasto: r.grupo_gasto,
        nome: r.nome,
      });
    }
    return out;
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findSetorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM setores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findAtendimentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM atendimentos
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

  async findPacoteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacotes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ────────── Mutations ──────────

  async insertContaItem(args: InsertContaItemArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO contas_itens (
        tenant_id, conta_id, procedimento_id, grupo_gasto,
        origem, origem_referencia_id, origem_referencia_tipo,
        quantidade, valor_unitario, valor_total,
        prestador_executante_id, setor_id, data_realizacao,
        autorizado, numero_autorizacao,
        fora_pacote, pacote_id,
        lote, validade_lote, registro_anvisa, fabricante,
        created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.contaId}::bigint,
        ${args.procedimentoId}::bigint,
        ${args.grupoGasto}::enum_grupo_gasto,
        ${args.origem}::enum_conta_origem_item,
        ${args.origemReferenciaId}::bigint,
        ${args.origemReferenciaTipo},
        ${args.quantidade}::numeric,
        ${args.valorUnitario}::numeric,
        ${args.valorTotal}::numeric,
        ${args.prestadorExecutanteId}::bigint,
        ${args.setorId}::bigint,
        ${args.dataRealizacao}::timestamptz,
        ${args.autorizado}::boolean,
        ${args.numeroAutorizacao},
        ${args.foraPacote}::boolean,
        ${args.pacoteId}::bigint,
        ${args.lote},
        ${args.validadeLote}::date,
        ${args.registroAnvisa},
        ${args.fabricante},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT contas_itens não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async softDeleteContaItem(itemId: bigint, userId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas_itens
         SET deleted_at = now(),
             deleted_by = ${userId}::bigint
       WHERE id = ${itemId}::bigint
         AND deleted_at IS NULL
    `;
  }

  async updateContaItemValor(
    itemId: bigint,
    valorUnitario: string,
    valorTotal: string,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas_itens
         SET valor_unitario = ${valorUnitario}::numeric,
             valor_total    = ${valorTotal}::numeric,
             updated_at     = now()
       WHERE id = ${itemId}::bigint
    `;
  }

  async updateContaItemForaPacote(
    itemId: bigint,
    foraPacote: boolean,
    pacoteId: bigint | null,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas_itens
         SET fora_pacote = ${foraPacote}::boolean,
             pacote_id   = ${pacoteId}::bigint,
             updated_at  = now()
       WHERE id = ${itemId}::bigint
    `;
  }

  async updateContaStatus(
    contaId: bigint,
    novoStatus: ContaStatus,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET status     = ${novoStatus}::enum_conta_status,
             updated_at = now()
       WHERE id = ${contaId}::bigint
    `;
  }

  async setDataElaboracaoInicio(contaId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET data_elaboracao_inicio = COALESCE(data_elaboracao_inicio, now()),
             updated_at = now()
       WHERE id = ${contaId}::bigint
    `;
  }

  async setInconsistencias(
    contaId: bigint,
    inconsistencias: Inconsistencia[],
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET inconsistencias = ${JSON.stringify(inconsistencias)}::jsonb,
             data_elaboracao_fim = now(),
             updated_at = now()
       WHERE id = ${contaId}::bigint
    `;
  }

  async applySnapshotsAndFechar(args: {
    contaId: bigint;
    snapshot: SnapshotPayload;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const condJson = JSON.stringify(args.snapshot.condicaoContratual ?? null);
    const tabJson = JSON.stringify(args.snapshot.tabelaPrecos ?? null);
    await tx.$executeRaw`
      UPDATE contas
         SET versao_tiss_snapshot     = ${args.snapshot.versaoTiss},
             condicao_contratual_snap = ${condJson}::jsonb,
             tabela_precos_snap       = ${tabJson}::jsonb,
             iss_aliquota_snap        = ${args.snapshot.issAliquota}::numeric,
             iss_valor                = ${args.snapshot.issValor}::numeric,
             iss_retem                = ${args.snapshot.issRetem}::boolean,
             status                   = 'FECHADA'::enum_conta_status,
             data_fechamento          = now(),
             updated_at               = now()
       WHERE id = ${args.contaId}::bigint
    `;
  }

  async setObservacaoElaboracao(
    contaId: bigint,
    observacao: string,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET observacao_elaboracao = ${observacao},
             updated_at = now()
       WHERE id = ${contaId}::bigint
    `;
  }

  // ────────── Catálogo TISS / Tabela de preços ──────────

  /**
   * Resolve a `condicao_contratual` vigente para o convênio na data
   * informada. Retorna `null` se o plano/convênio não tiver condição
   * contratual ativa cobrindo a data — neste caso o use case decide
   * se pode prosseguir (PARTICULAR ignora; CONVENIO bloqueia).
   */
  async findCondicaoContratualVigente(args: {
    convenioId: bigint;
    planoId: bigint | null;
    referenciaIso: string;
  }): Promise<{
    id: bigint;
    versao: number;
    payload: Record<string, unknown>;
    issAliquota: string | null;
    issRetem: boolean;
    versaoTiss: string | null;
  } | null> {
    const tx = this.prisma.tx();
    const planoFilter = args.planoId ?? null;
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        versao: number;
        coberturas: unknown;
        especialidades_habilitadas: unknown;
        agrupamentos: unknown;
        parametros_tiss: unknown;
        iss_aliquota: string | null;
        iss_retem: boolean;
        prazo_envio_lote_dias: number;
        exige_autorizacao_internacao: boolean;
        exige_autorizacao_opme: boolean;
        vigencia_inicio: Date;
        vigencia_fim: Date | null;
        versao_tiss: string | null;
      }[]
    >`
      SELECT id, versao, coberturas, especialidades_habilitadas, agrupamentos,
             parametros_tiss,
             iss_aliquota::text AS iss_aliquota,
             iss_retem,
             prazo_envio_lote_dias,
             exige_autorizacao_internacao,
             exige_autorizacao_opme,
             vigencia_inicio,
             vigencia_fim,
             (parametros_tiss ->> 'versao_tiss') AS versao_tiss
        FROM condicoes_contratuais
       WHERE convenio_id = ${args.convenioId}::bigint
         AND ativo = TRUE
         AND vigencia_inicio <= ${args.referenciaIso}::date
         AND (vigencia_fim IS NULL OR vigencia_fim >= ${args.referenciaIso}::date)
         AND (
              ${planoFilter}::bigint IS NULL
           OR plano_id IS NULL
           OR plano_id = ${planoFilter}::bigint
         )
       ORDER BY (plano_id IS NOT NULL) DESC, versao DESC
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      versao: r.versao,
      payload: {
        id: r.id.toString(),
        versao: r.versao,
        coberturas: r.coberturas,
        especialidades_habilitadas: r.especialidades_habilitadas,
        agrupamentos: r.agrupamentos,
        parametros_tiss: r.parametros_tiss,
        iss_aliquota: r.iss_aliquota,
        iss_retem: r.iss_retem,
        prazo_envio_lote_dias: r.prazo_envio_lote_dias,
        exige_autorizacao_internacao: r.exige_autorizacao_internacao,
        exige_autorizacao_opme: r.exige_autorizacao_opme,
        vigencia_inicio: r.vigencia_inicio.toISOString().slice(0, 10),
        vigencia_fim:
          r.vigencia_fim === null ? null : r.vigencia_fim.toISOString().slice(0, 10),
      },
      issAliquota: r.iss_aliquota,
      issRetem: r.iss_retem,
      versaoTiss: r.versao_tiss,
    };
  }

  /**
   * Resolve a tabela de preços vigente para o convênio (com plano se
   * fornecido) na data informada e retorna o mapa
   * `procedimentoId → valor_unitario` para a lista de procedimentos
   * de interesse (snapshot mínimo do que está sendo usado pela conta).
   */
  async findTabelaPrecosSnapshot(args: {
    convenioId: bigint;
    planoId: bigint | null;
    procedimentoIds: bigint[];
    referenciaIso: string;
  }): Promise<{
    tabelaId: bigint | null;
    tabelaCodigo: string | null;
    tabelaVersao: number | null;
    valores: Record<string, string>;
  }> {
    const tx = this.prisma.tx();
    const planoFilter = args.planoId ?? null;
    const rows = await tx.$queryRaw<
      { tabela_id: bigint; codigo: string; versao: number }[]
    >`
      SELECT tp.id AS tabela_id, tp.codigo, tp.versao
        FROM convenios_tabelas_precos ctp
        JOIN tabelas_precos tp ON tp.id = ctp.tabela_id
       WHERE ctp.convenio_id = ${args.convenioId}::bigint
         AND tp.ativa = TRUE
         AND tp.vigencia_inicio <= ${args.referenciaIso}::date
         AND (tp.vigencia_fim IS NULL OR tp.vigencia_fim >= ${args.referenciaIso}::date)
         AND (
              ${planoFilter}::bigint IS NULL
           OR ctp.plano_id IS NULL
           OR ctp.plano_id = ${planoFilter}::bigint
         )
       ORDER BY (ctp.plano_id IS NOT NULL) DESC, ctp.prioridade ASC, tp.versao DESC
       LIMIT 1
    `;
    if (rows.length === 0) {
      return {
        tabelaId: null,
        tabelaCodigo: null,
        tabelaVersao: null,
        valores: {},
      };
    }
    const tabela = rows[0];
    if (args.procedimentoIds.length === 0) {
      return {
        tabelaId: tabela.tabela_id,
        tabelaCodigo: tabela.codigo,
        tabelaVersao: tabela.versao,
        valores: {},
      };
    }
    const itens = await tx.$queryRaw<
      { procedimento_id: bigint; valor: string }[]
    >`
      SELECT procedimento_id, valor::text AS valor
        FROM tabelas_precos_itens
       WHERE tabela_id = ${tabela.tabela_id}::bigint
         AND procedimento_id = ANY(${args.procedimentoIds}::bigint[])
    `;
    const valores: Record<string, string> = {};
    for (const it of itens) {
      valores[it.procedimento_id.toString()] = it.valor;
    }
    return {
      tabelaId: tabela.tabela_id,
      tabelaCodigo: tabela.codigo,
      tabelaVersao: tabela.versao,
      valores,
    };
  }

  // ────────── Idempotência (RN-FAT-07) ──────────

  /**
   * Procura uma operação `contas.recalculada` registrada nas últimas
   * 24h para o `operacao_uuid` informado. Se encontrada, devolve `true`
   * — o use case retorna 200 sem reexecutar.
   */
  async findRecalculoIdempotente(
    contaId: bigint,
    operacaoUuid: string,
  ): Promise<boolean> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM auditoria_eventos
         WHERE tabela = 'contas'
           AND registro_id = ${contaId}::bigint
           AND finalidade = 'contas.recalculada'
           AND (diff ->> 'operacao_uuid') = ${operacaoUuid}
           AND created_at >= now() - INTERVAL '24 hours'
        LIMIT 1
      ) AS existe
    `;
    return rows.length > 0 && rows[0].existe === true;
  }
}
