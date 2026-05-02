/**
 * `RepasseRepository` — fonte única de SQL do módulo Repasse Médico.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 *
 * Convenções:
 *   - Escritas em `repasses_itens` disparam a trigger
 *     `tg_atualiza_totais_repasse` que recalcula `repasses.valor_*`
 *     automaticamente — não atualizamos totais manualmente.
 *   - Trigger `tg_repasse_imutavel` bloqueia mudanças em repasse PAGO
 *     fora da única transição PAGO → CANCELADO (estorno).
 *
 * R-A é responsável pelos métodos de critérios (CRUD) e apuração
 * (insert + lookup de itens da competência).
 * R-B é responsável pelos métodos de lifecycle (conferir/liberar/pagar/
 * cancelar), folha de produção e reapuração.
 *
 * Mantemos um único arquivo para compartilhar tipos `RepasseRow` e
 * `RepasseItemRow` entre os dois lados.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  CriterioRegras,
  RepasseMomento,
  RepasseTipoBaseCalculo,
} from '../domain/criterio';
import type { RepasseStatus } from '../domain/repasse-lifecycle';

// ────────── Row types ──────────

// ───── Trilha R-A: Critérios + apuração ─────

export interface CriterioRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  descricao: string;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  unidade_faturamento_id: bigint | null;
  unidade_atendimento_id: bigint | null;
  unidade_faturamento_uuid: string | null;
  unidade_atendimento_uuid: string | null;
  tipo_base_calculo: RepasseTipoBaseCalculo;
  momento_repasse: RepasseMomento;
  dia_fechamento: number | null;
  prazo_dias: number | null;
  prioridade: number;
  regras: unknown;
  ativo: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export interface PrestadorElegivelRow {
  id: bigint;
  uuid_externo: string;
  nome: string;
  tipo_vinculo: string;
}

export interface ContaItemElegivelRow {
  conta_id: bigint;
  conta_item_id: bigint;
  cirurgia_id: bigint | null;
  procedimento_id: bigint;
  codigo_procedimento: string;
  grupo_gasto: string;
  /** Função do prestador no item — derivada de cirurgias_equipe.funcao
   *  (origem CIRURGIA) OU 'EXECUTANTE' (executante direto). */
  funcao: string;
  prestador_id: bigint;
  data_realizacao: Date | null;
  valor_total: string;
  valor_glosa: string;
  convenio_id: bigint | null;
}

export interface InsertCriterioArgs {
  tenantId: bigint;
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  unidadeFaturamentoId: bigint | null;
  unidadeAtendimentoId: bigint | null;
  tipoBaseCalculo: RepasseTipoBaseCalculo;
  momentoRepasse: RepasseMomento;
  diaFechamento: number | null;
  prazoDias: number | null;
  prioridade: number;
  ativo: boolean;
  regras: CriterioRegras;
  userId: bigint;
}

export interface UpdateCriterioArgs {
  id: bigint;
  descricao?: string;
  vigenciaInicio?: string;
  vigenciaFim?: string | null;
  unidadeFaturamentoId?: bigint | null;
  unidadeAtendimentoId?: bigint | null;
  tipoBaseCalculo?: RepasseTipoBaseCalculo;
  momentoRepasse?: RepasseMomento;
  diaFechamento?: number | null;
  prazoDias?: number | null;
  prioridade?: number;
  ativo?: boolean;
  regras?: Record<string, unknown>;
}

// ───── Lifecycle / Folha (Trilha R-B) ─────

export interface RepasseRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  prestador_id: bigint;
  prestador_uuid: string;
  prestador_nome: string;
  conselho_sigla: string | null;
  conselho_numero: string | null;
  competencia: string;
  data_apuracao: Date;
  data_conferencia: Date | null;
  conferido_por: bigint | null;
  conferido_por_uuid: string | null;
  data_liberacao: Date | null;
  liberado_por: bigint | null;
  liberado_por_uuid: string | null;
  data_pagamento: Date | null;
  pago_por: bigint | null;
  pago_por_uuid: string | null;
  valor_bruto: string;
  valor_creditos: string;
  valor_debitos: string;
  valor_descontos: string;
  valor_impostos: string;
  valor_liquido: string;
  status: RepasseStatus;
  cancelado_em: Date | null;
  cancelado_motivo: string | null;
  observacao: string | null;
  qtd_itens: number;
  created_at: Date;
  updated_at: Date | null;
}

export interface RepasseItemRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  repasse_id: bigint;
  conta_id: bigint;
  conta_uuid: string;
  conta_numero: string | null;
  conta_item_id: bigint | null;
  conta_item_uuid: string | null;
  cirurgia_id: bigint | null;
  cirurgia_uuid: string | null;
  paciente_nome: string | null;
  procedimento_codigo: string | null;
  procedimento_nome: string | null;
  criterio_id: bigint | null;
  criterio_uuid: string | null;
  criterio_descricao: string | null;
  funcao: string | null;
  base_calculo: string;
  percentual: string | null;
  valor_fixo: string | null;
  valor_calculado: string;
  glosado: boolean;
  observacao: string | null;
  reapurado_de_id: bigint | null;
  reapurado_de_uuid: string | null;
  created_at: Date;
}

export interface FolhaResumoRow {
  prestador_id: bigint;
  prestador_uuid: string;
  prestador_nome: string;
  conselho_sigla: string | null;
  conselho_numero: string | null;
  repasse_uuid: string;
  status: RepasseStatus;
  valor_bruto: string;
  valor_liquido: string;
  qtd_itens: number;
}

export interface FolhaAgregadoFuncaoRow {
  funcao: string | null;
  qtd: number;
  valor: string;
}

export interface FolhaAgregadoCriterioRow {
  criterio_uuid: string | null;
  descricao: string | null;
  qtd: number;
  valor: string;
}

// ────────── Insert/update args ──────────

export interface InsertRepasseArgs {
  tenantId: bigint;
  prestadorId: bigint;
  competencia: string;
  observacao: string | null;
  userId: bigint;
}

export interface InsertRepasseItemArgs {
  tenantId: bigint;
  repasseId: bigint;
  contaId: bigint;
  contaItemId: bigint | null;
  cirurgiaId: bigint | null;
  criterioId: bigint | null;
  funcao: string | null;
  baseCalculo: string;
  percentual: string | null;
  valorFixo: string | null;
  valorCalculado: string;
  criterioSnapshot: unknown | null;
  reapuradoDeId: bigint | null;
  glosado: boolean;
  observacao: string | null;
}

@Injectable()
export class RepasseRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Helpers de lookup ──────────

  /**
   * Localiza conta pelo UUID externo (tenant via RLS).
   */
  async findContaByUuid(uuid: string): Promise<{
    id: bigint;
    convenioId: bigint | null;
    unidadeFaturamentoId: bigint | null;
    numero: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        convenio_id: bigint | null;
        unidade_faturamento_id: bigint | null;
        numero_conta: string;
      }[]
    >`
      SELECT id, convenio_id, unidade_faturamento_id, numero_conta
        FROM contas
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : {
          id: rows[0].id,
          convenioId: rows[0].convenio_id,
          unidadeFaturamentoId: rows[0].unidade_faturamento_id,
          numero: rows[0].numero_conta,
        };
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findUnidadeFaturamentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM unidades_faturamento
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findUnidadeAtendimentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM unidades_atendimento
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ────────── Critérios (Trilha R-A) ──────────

  async findCriterioByUuid(uuid: string): Promise<CriterioRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CriterioRow[]>`
      SELECT cr.id,
             cr.uuid_externo::text       AS uuid_externo,
             cr.tenant_id,
             cr.descricao,
             cr.vigencia_inicio,
             cr.vigencia_fim,
             cr.unidade_faturamento_id,
             cr.unidade_atendimento_id,
             uf.uuid_externo::text       AS unidade_faturamento_uuid,
             ua.uuid_externo::text       AS unidade_atendimento_uuid,
             cr.tipo_base_calculo::text  AS tipo_base_calculo,
             cr.momento_repasse::text    AS momento_repasse,
             cr.dia_fechamento,
             cr.prazo_dias,
             cr.prioridade,
             cr.regras,
             cr.ativo,
             cr.created_at,
             cr.updated_at
        FROM criterios_repasse cr
   LEFT JOIN unidades_faturamento uf ON uf.id = cr.unidade_faturamento_id
   LEFT JOIN unidades_atendimento ua ON ua.id = cr.unidade_atendimento_id
       WHERE cr.uuid_externo = ${uuid}::uuid
         AND cr.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listCriterios(args: {
    ativo?: boolean;
    unidadeFaturamentoId?: bigint;
    unidadeAtendimentoId?: bigint;
    vigentesEm?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CriterioRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const ativoFilter = args.ativo === undefined ? null : args.ativo;
    const ufFilter = args.unidadeFaturamentoId ?? null;
    const uaFilter = args.unidadeAtendimentoId ?? null;
    const vigenteEm = args.vigentesEm ?? null;

    const rows = await tx.$queryRaw<CriterioRow[]>`
      SELECT cr.id,
             cr.uuid_externo::text       AS uuid_externo,
             cr.tenant_id,
             cr.descricao,
             cr.vigencia_inicio,
             cr.vigencia_fim,
             cr.unidade_faturamento_id,
             cr.unidade_atendimento_id,
             uf.uuid_externo::text       AS unidade_faturamento_uuid,
             ua.uuid_externo::text       AS unidade_atendimento_uuid,
             cr.tipo_base_calculo::text  AS tipo_base_calculo,
             cr.momento_repasse::text    AS momento_repasse,
             cr.dia_fechamento,
             cr.prazo_dias,
             cr.prioridade,
             cr.regras,
             cr.ativo,
             cr.created_at,
             cr.updated_at
        FROM criterios_repasse cr
   LEFT JOIN unidades_faturamento uf ON uf.id = cr.unidade_faturamento_id
   LEFT JOIN unidades_atendimento ua ON ua.id = cr.unidade_atendimento_id
       WHERE cr.deleted_at IS NULL
         AND (${ativoFilter}::bool IS NULL OR cr.ativo = ${ativoFilter}::bool)
         AND (${ufFilter}::bigint IS NULL OR cr.unidade_faturamento_id = ${ufFilter}::bigint)
         AND (${uaFilter}::bigint IS NULL OR cr.unidade_atendimento_id = ${uaFilter}::bigint)
         AND (${vigenteEm}::date IS NULL
              OR (cr.vigencia_inicio <= ${vigenteEm}::date
                  AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= ${vigenteEm}::date)))
       ORDER BY cr.prioridade ASC, cr.vigencia_inicio DESC, cr.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM criterios_repasse cr
       WHERE cr.deleted_at IS NULL
         AND (${ativoFilter}::bool IS NULL OR cr.ativo = ${ativoFilter}::bool)
         AND (${ufFilter}::bigint IS NULL OR cr.unidade_faturamento_id = ${ufFilter}::bigint)
         AND (${uaFilter}::bigint IS NULL OR cr.unidade_atendimento_id = ${uaFilter}::bigint)
         AND (${vigenteEm}::date IS NULL
              OR (cr.vigencia_inicio <= ${vigenteEm}::date
                  AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= ${vigenteEm}::date)))
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async insertCriterio(args: InsertCriterioArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const regrasJson = JSON.stringify(args.regras);
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO criterios_repasse (
        tenant_id, descricao, vigencia_inicio, vigencia_fim,
        unidade_faturamento_id, unidade_atendimento_id,
        tipo_base_calculo, momento_repasse, dia_fechamento, prazo_dias,
        prioridade, regras, ativo, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.descricao},
        ${args.vigenciaInicio}::date,
        ${args.vigenciaFim}::date,
        ${args.unidadeFaturamentoId}::bigint,
        ${args.unidadeAtendimentoId}::bigint,
        ${args.tipoBaseCalculo}::enum_repasse_tipo_base_calculo,
        ${args.momentoRepasse}::enum_repasse_momento,
        ${args.diaFechamento}::int,
        ${args.prazoDias}::int,
        ${args.prioridade}::int,
        ${regrasJson}::jsonb,
        ${args.ativo},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT criterios_repasse não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateCriterio(args: UpdateCriterioArgs): Promise<void> {
    const tx = this.prisma.tx();
    // Strategy: COALESCE em cada campo — preserva valor atual quando arg
    // não é fornecido. `null` explícito significa "limpar" (apenas para
    // unidade_*_id e vigencia_fim).
    const regrasJson =
      args.regras === undefined ? null : JSON.stringify(args.regras);
    const ufExplicit =
      args.unidadeFaturamentoId === undefined ? false : true;
    const uaExplicit =
      args.unidadeAtendimentoId === undefined ? false : true;
    const vfExplicit = args.vigenciaFim === undefined ? false : true;

    await tx.$executeRaw`
      UPDATE criterios_repasse SET
        descricao              = COALESCE(${args.descricao}, descricao),
        vigencia_inicio        = COALESCE(${args.vigenciaInicio}::date, vigencia_inicio),
        vigencia_fim           = CASE WHEN ${vfExplicit}::bool
                                      THEN ${args.vigenciaFim ?? null}::date
                                      ELSE vigencia_fim END,
        unidade_faturamento_id = CASE WHEN ${ufExplicit}::bool
                                      THEN ${args.unidadeFaturamentoId ?? null}::bigint
                                      ELSE unidade_faturamento_id END,
        unidade_atendimento_id = CASE WHEN ${uaExplicit}::bool
                                      THEN ${args.unidadeAtendimentoId ?? null}::bigint
                                      ELSE unidade_atendimento_id END,
        tipo_base_calculo      = COALESCE(${args.tipoBaseCalculo}::enum_repasse_tipo_base_calculo, tipo_base_calculo),
        momento_repasse        = COALESCE(${args.momentoRepasse}::enum_repasse_momento, momento_repasse),
        dia_fechamento         = COALESCE(${args.diaFechamento}::int, dia_fechamento),
        prazo_dias             = COALESCE(${args.prazoDias}::int, prazo_dias),
        prioridade             = COALESCE(${args.prioridade}::int, prioridade),
        ativo                  = COALESCE(${args.ativo}, ativo),
        regras                 = COALESCE(${regrasJson}::jsonb, regras),
        updated_at             = now()
      WHERE id = ${args.id}::bigint
        AND deleted_at IS NULL
    `;
  }

  async softDeleteCriterio(id: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE criterios_repasse
         SET deleted_at = now(),
             ativo      = FALSE,
             updated_at = now()
       WHERE id = ${id}::bigint
         AND deleted_at IS NULL
    `;
  }

  // ────────── Repasse: read ──────────

  async findRepasseByUuid(uuid: string): Promise<RepasseRow | null> {
    const tx = this.prisma.tx();
    // Inline para que Prisma trate parâmetros de forma segura.
    const rows = await tx.$queryRaw<RepasseRow[]>`
      SELECT r.id,
             r.uuid_externo::text AS uuid_externo,
             r.tenant_id,
             r.prestador_id,
             p.uuid_externo::text AS prestador_uuid,
             p.nome               AS prestador_nome,
             p.tipo_conselho::text AS conselho_sigla,
             p.numero_conselho    AS conselho_numero,
             r.competencia,
             r.data_apuracao,
             r.data_conferencia,
             r.conferido_por,
             uc.uuid_externo::text AS conferido_por_uuid,
             r.data_liberacao,
             r.liberado_por,
             ul.uuid_externo::text AS liberado_por_uuid,
             r.data_pagamento,
             r.pago_por,
             up.uuid_externo::text AS pago_por_uuid,
             r.valor_bruto::text     AS valor_bruto,
             r.valor_creditos::text  AS valor_creditos,
             r.valor_debitos::text   AS valor_debitos,
             r.valor_descontos::text AS valor_descontos,
             r.valor_impostos::text  AS valor_impostos,
             r.valor_liquido::text   AS valor_liquido,
             r.status::text  AS status,
             r.cancelado_em,
             r.cancelado_motivo,
             r.observacao,
             COALESCE((SELECT COUNT(*)::int FROM repasses_itens ri WHERE ri.repasse_id = r.id), 0) AS qtd_itens,
             r.created_at,
             r.updated_at
        FROM repasses r
        JOIN prestadores p ON p.id = r.prestador_id
        LEFT JOIN usuarios uc ON uc.id = r.conferido_por
        LEFT JOIN usuarios ul ON ul.id = r.liberado_por
        LEFT JOIN usuarios up ON up.id = r.pago_por
       WHERE r.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findRepassePorPrestadorCompetencia(
    prestadorId: bigint,
    competencia: string,
  ): Promise<RepasseRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<RepasseRow[]>`
      SELECT r.id,
             r.uuid_externo::text AS uuid_externo,
             r.tenant_id,
             r.prestador_id,
             p.uuid_externo::text AS prestador_uuid,
             p.nome               AS prestador_nome,
             p.tipo_conselho::text AS conselho_sigla,
             p.numero_conselho    AS conselho_numero,
             r.competencia,
             r.data_apuracao,
             r.data_conferencia,
             r.conferido_por,
             uc.uuid_externo::text AS conferido_por_uuid,
             r.data_liberacao,
             r.liberado_por,
             ul.uuid_externo::text AS liberado_por_uuid,
             r.data_pagamento,
             r.pago_por,
             up.uuid_externo::text AS pago_por_uuid,
             r.valor_bruto::text     AS valor_bruto,
             r.valor_creditos::text  AS valor_creditos,
             r.valor_debitos::text   AS valor_debitos,
             r.valor_descontos::text AS valor_descontos,
             r.valor_impostos::text  AS valor_impostos,
             r.valor_liquido::text   AS valor_liquido,
             r.status::text  AS status,
             r.cancelado_em,
             r.cancelado_motivo,
             r.observacao,
             COALESCE((SELECT COUNT(*)::int FROM repasses_itens ri WHERE ri.repasse_id = r.id), 0) AS qtd_itens,
             r.created_at,
             r.updated_at
        FROM repasses r
        JOIN prestadores p ON p.id = r.prestador_id
        LEFT JOIN usuarios uc ON uc.id = r.conferido_por
        LEFT JOIN usuarios ul ON ul.id = r.liberado_por
        LEFT JOIN usuarios up ON up.id = r.pago_por
       WHERE r.prestador_id = ${prestadorId}::bigint
         AND r.competencia  = ${competencia}
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listRepasses(args: {
    statuses?: RepasseStatus[];
    competencia?: string;
    prestadorId?: bigint;
    unidadeFaturamentoId?: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ rows: RepasseRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusFilter =
      args.statuses === undefined || args.statuses.length === 0
        ? null
        : args.statuses;
    const competenciaFilter = args.competencia ?? null;
    const prestadorFilter = args.prestadorId ?? null;
    const unidadeFatFilter = args.unidadeFaturamentoId ?? null;

    const rows = await tx.$queryRaw<RepasseRow[]>`
      SELECT r.id,
             r.uuid_externo::text AS uuid_externo,
             r.tenant_id,
             r.prestador_id,
             p.uuid_externo::text AS prestador_uuid,
             p.nome               AS prestador_nome,
             p.tipo_conselho::text AS conselho_sigla,
             p.numero_conselho    AS conselho_numero,
             r.competencia,
             r.data_apuracao,
             r.data_conferencia,
             r.conferido_por,
             uc.uuid_externo::text AS conferido_por_uuid,
             r.data_liberacao,
             r.liberado_por,
             ul.uuid_externo::text AS liberado_por_uuid,
             r.data_pagamento,
             r.pago_por,
             up.uuid_externo::text AS pago_por_uuid,
             r.valor_bruto::text     AS valor_bruto,
             r.valor_creditos::text  AS valor_creditos,
             r.valor_debitos::text   AS valor_debitos,
             r.valor_descontos::text AS valor_descontos,
             r.valor_impostos::text  AS valor_impostos,
             r.valor_liquido::text   AS valor_liquido,
             r.status::text  AS status,
             r.cancelado_em,
             r.cancelado_motivo,
             r.observacao,
             COALESCE((SELECT COUNT(*)::int FROM repasses_itens ri WHERE ri.repasse_id = r.id), 0) AS qtd_itens,
             r.created_at,
             r.updated_at
        FROM repasses r
        JOIN prestadores p ON p.id = r.prestador_id
        LEFT JOIN usuarios uc ON uc.id = r.conferido_por
        LEFT JOIN usuarios ul ON ul.id = r.liberado_por
        LEFT JOIN usuarios up ON up.id = r.pago_por
       WHERE (${statusFilter}::text[] IS NULL OR r.status::text = ANY(${statusFilter}::text[]))
         AND (${competenciaFilter}::text IS NULL OR r.competencia = ${competenciaFilter}::text)
         AND (${prestadorFilter}::bigint IS NULL OR r.prestador_id = ${prestadorFilter}::bigint)
         AND (
              ${unidadeFatFilter}::bigint IS NULL
              OR EXISTS (
                SELECT 1 FROM repasses_itens ri
                  JOIN contas c ON c.id = ri.conta_id
                 WHERE ri.repasse_id = r.id
                   AND c.unidade_faturamento_id = ${unidadeFatFilter}::bigint
              )
         )
       ORDER BY r.competencia DESC, r.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM repasses r
       WHERE (${statusFilter}::text[] IS NULL OR r.status::text = ANY(${statusFilter}::text[]))
         AND (${competenciaFilter}::text IS NULL OR r.competencia = ${competenciaFilter}::text)
         AND (${prestadorFilter}::bigint IS NULL OR r.prestador_id = ${prestadorFilter}::bigint)
         AND (
              ${unidadeFatFilter}::bigint IS NULL
              OR EXISTS (
                SELECT 1 FROM repasses_itens ri
                  JOIN contas c ON c.id = ri.conta_id
                 WHERE ri.repasse_id = r.id
                   AND c.unidade_faturamento_id = ${unidadeFatFilter}::bigint
              )
         )
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ────────── Repasse: write ──────────

  async insertRepasse(args: InsertRepasseArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO repasses (
        tenant_id, prestador_id, competencia, observacao, status, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.prestadorId}::bigint,
        ${args.competencia},
        ${args.observacao},
        'APURADO'::enum_repasse_status,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT repasses não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateRepasseConferir(args: {
    id: bigint;
    userId: bigint;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses
         SET status            = 'CONFERIDO'::enum_repasse_status,
             data_conferencia  = now(),
             conferido_por     = ${args.userId}::bigint,
             observacao        = COALESCE(${args.observacao}, observacao),
             updated_at        = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateRepasseLiberar(args: {
    id: bigint;
    userId: bigint;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses
         SET status         = 'LIBERADO'::enum_repasse_status,
             data_liberacao = now(),
             liberado_por   = ${args.userId}::bigint,
             observacao     = COALESCE(${args.observacao}, observacao),
             updated_at     = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateRepasseMarcarPago(args: {
    id: bigint;
    userId: bigint;
    dataPagamento: string;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses
         SET status         = 'PAGO'::enum_repasse_status,
             data_pagamento = ${args.dataPagamento}::timestamptz,
             pago_por       = ${args.userId}::bigint,
             observacao     = COALESCE(${args.observacao}, observacao),
             updated_at     = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  async updateRepasseCancelar(args: {
    id: bigint;
    motivo: string;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses
         SET status           = 'CANCELADO'::enum_repasse_status,
             cancelado_em     = now(),
             cancelado_motivo = ${args.motivo},
             updated_at       = now()
       WHERE id = ${args.id}::bigint
    `;
  }

  // ────────── Repasses_itens: read ──────────

  async findRepasseItensByRepasseId(
    repasseId: bigint,
  ): Promise<RepasseItemRow[]> {
    const tx = this.prisma.tx();
    return await tx.$queryRaw<RepasseItemRow[]>`
      SELECT ri.id,
             ri.uuid_externo::text AS uuid_externo,
             ri.tenant_id,
             ri.repasse_id,
             ri.conta_id,
             c.uuid_externo::text  AS conta_uuid,
             c.numero_conta        AS conta_numero,
             ri.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid,
             ri.cirurgia_id,
             cir.uuid_externo::text AS cirurgia_uuid,
             pa.nome               AS paciente_nome,
             tp.codigo             AS procedimento_codigo,
             tp.nome               AS procedimento_nome,
             ri.criterio_id,
             cr.uuid_externo::text AS criterio_uuid,
             cr.descricao          AS criterio_descricao,
             ri.funcao,
             ri.base_calculo::text    AS base_calculo,
             ri.percentual::text      AS percentual,
             ri.valor_fixo::text      AS valor_fixo,
             ri.valor_calculado::text AS valor_calculado,
             ri.glosado,
             ri.observacao,
             ri.reapurado_de_id,
             rio.uuid_externo::text AS reapurado_de_uuid,
             ri.created_at
        FROM repasses_itens ri
        JOIN contas c       ON c.id  = ri.conta_id
   LEFT JOIN contas_itens   ci ON ci.id  = ri.conta_item_id
   LEFT JOIN cirurgias      cir ON cir.id = ri.cirurgia_id
   LEFT JOIN pacientes      pa  ON pa.id  = c.paciente_id
   LEFT JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
   LEFT JOIN criterios_repasse cr ON cr.id = ri.criterio_id
   LEFT JOIN repasses_itens rio ON rio.id = ri.reapurado_de_id
       WHERE ri.repasse_id = ${repasseId}::bigint
       ORDER BY ri.created_at ASC, ri.id ASC
    `;
  }

  /**
   * Itens de repasse vinculados a uma conta — usado pela reapuração.
   */
  async findRepassesItensByConta(
    contaId: bigint,
  ): Promise<RepasseItemRow[]> {
    const tx = this.prisma.tx();
    return await tx.$queryRaw<RepasseItemRow[]>`
      SELECT ri.id,
             ri.uuid_externo::text AS uuid_externo,
             ri.tenant_id,
             ri.repasse_id,
             ri.conta_id,
             c.uuid_externo::text  AS conta_uuid,
             c.numero_conta        AS conta_numero,
             ri.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid,
             ri.cirurgia_id,
             cir.uuid_externo::text AS cirurgia_uuid,
             pa.nome               AS paciente_nome,
             tp.codigo             AS procedimento_codigo,
             tp.nome               AS procedimento_nome,
             ri.criterio_id,
             cr.uuid_externo::text AS criterio_uuid,
             cr.descricao          AS criterio_descricao,
             ri.funcao,
             ri.base_calculo::text    AS base_calculo,
             ri.percentual::text      AS percentual,
             ri.valor_fixo::text      AS valor_fixo,
             ri.valor_calculado::text AS valor_calculado,
             ri.glosado,
             ri.observacao,
             ri.reapurado_de_id,
             rio.uuid_externo::text AS reapurado_de_uuid,
             ri.created_at
        FROM repasses_itens ri
        JOIN contas c       ON c.id  = ri.conta_id
   LEFT JOIN contas_itens   ci ON ci.id  = ri.conta_item_id
   LEFT JOIN cirurgias      cir ON cir.id = ri.cirurgia_id
   LEFT JOIN pacientes      pa  ON pa.id  = c.paciente_id
   LEFT JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
   LEFT JOIN criterios_repasse cr ON cr.id = ri.criterio_id
   LEFT JOIN repasses_itens rio ON rio.id = ri.reapurado_de_id
       WHERE ri.conta_id = ${contaId}::bigint
       ORDER BY ri.created_at ASC, ri.id ASC
    `;
  }

  /**
   * Itens GLOSADOS de uma conta — base para a reapuração quando glosa
   * é revertida (RN-REP-06). Os itens originais ficam glosados e novos
   * itens são lançados no repasse vigente.
   */
  async findRepassesItensGlosadosByConta(
    contaId: bigint,
  ): Promise<RepasseItemRow[]> {
    const tx = this.prisma.tx();
    return await tx.$queryRaw<RepasseItemRow[]>`
      SELECT ri.id,
             ri.uuid_externo::text AS uuid_externo,
             ri.tenant_id,
             ri.repasse_id,
             ri.conta_id,
             c.uuid_externo::text  AS conta_uuid,
             c.numero_conta        AS conta_numero,
             ri.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid,
             ri.cirurgia_id,
             cir.uuid_externo::text AS cirurgia_uuid,
             pa.nome               AS paciente_nome,
             tp.codigo             AS procedimento_codigo,
             tp.nome               AS procedimento_nome,
             ri.criterio_id,
             cr.uuid_externo::text AS criterio_uuid,
             cr.descricao          AS criterio_descricao,
             ri.funcao,
             ri.base_calculo::text    AS base_calculo,
             ri.percentual::text      AS percentual,
             ri.valor_fixo::text      AS valor_fixo,
             ri.valor_calculado::text AS valor_calculado,
             ri.glosado,
             ri.observacao,
             ri.reapurado_de_id,
             rio.uuid_externo::text AS reapurado_de_uuid,
             ri.created_at
        FROM repasses_itens ri
        JOIN repasses r     ON r.id  = ri.repasse_id
        JOIN contas c       ON c.id  = ri.conta_id
   LEFT JOIN contas_itens   ci ON ci.id  = ri.conta_item_id
   LEFT JOIN cirurgias      cir ON cir.id = ri.cirurgia_id
   LEFT JOIN pacientes      pa  ON pa.id  = c.paciente_id
   LEFT JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
   LEFT JOIN criterios_repasse cr ON cr.id = ri.criterio_id
   LEFT JOIN repasses_itens rio ON rio.id = ri.reapurado_de_id
       WHERE ri.conta_id = ${contaId}::bigint
         AND ri.glosado  = TRUE
         AND r.status   <> 'CANCELADO'::enum_repasse_status
       ORDER BY ri.id ASC
    `;
  }

  // ────────── Repasses_itens: write ──────────

  async insertRepasseItem(args: InsertRepasseItemArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const snapshotJson =
      args.criterioSnapshot === null
        ? null
        : JSON.stringify(args.criterioSnapshot);
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO repasses_itens (
        tenant_id, repasse_id, conta_id, conta_item_id, cirurgia_id,
        criterio_id, funcao, base_calculo, percentual, valor_fixo,
        valor_calculado, criterio_snapshot, reapurado_de_id, glosado,
        observacao
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.repasseId}::bigint,
        ${args.contaId}::bigint,
        ${args.contaItemId}::bigint,
        ${args.cirurgiaId}::bigint,
        ${args.criterioId}::bigint,
        ${args.funcao},
        ${args.baseCalculo}::numeric,
        ${args.percentual}::numeric,
        ${args.valorFixo}::numeric,
        ${args.valorCalculado}::numeric,
        ${snapshotJson}::jsonb,
        ${args.reapuradoDeId}::bigint,
        ${args.glosado},
        ${args.observacao}
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT repasses_itens não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  /**
   * Marca um item de repasse como glosado (afeta totais via trigger).
   */
  async markRepasseItemGlosado(itemId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses_itens
         SET glosado = TRUE
       WHERE id = ${itemId}::bigint
         AND glosado = FALSE
    `;
  }

  // ────────── Folha de produção ──────────

  /**
   * Resumo da folha por (prestador × competência).
   *
   * Quando `unidadeFaturamentoId` é fornecido, restringe aos repasses
   * que possuem itens de contas dessa unidade.
   */
  async findFolhaResumo(args: {
    competencia: string;
    unidadeFaturamentoId?: bigint;
  }): Promise<FolhaResumoRow[]> {
    const tx = this.prisma.tx();
    const unidadeFatFilter = args.unidadeFaturamentoId ?? null;
    return await tx.$queryRaw<FolhaResumoRow[]>`
      SELECT r.prestador_id,
             p.uuid_externo::text   AS prestador_uuid,
             p.nome                 AS prestador_nome,
             p.tipo_conselho::text  AS conselho_sigla,
             p.numero_conselho      AS conselho_numero,
             r.uuid_externo::text   AS repasse_uuid,
             r.status::text         AS status,
             r.valor_bruto::text    AS valor_bruto,
             r.valor_liquido::text  AS valor_liquido,
             COALESCE((SELECT COUNT(*)::int
                         FROM repasses_itens ri
                        WHERE ri.repasse_id = r.id), 0) AS qtd_itens
        FROM repasses r
        JOIN prestadores p ON p.id = r.prestador_id
       WHERE r.competencia = ${args.competencia}
         AND r.status     <> 'CANCELADO'::enum_repasse_status
         AND (
              ${unidadeFatFilter}::bigint IS NULL
              OR EXISTS (
                SELECT 1 FROM repasses_itens ri
                  JOIN contas c ON c.id = ri.conta_id
                 WHERE ri.repasse_id = r.id
                   AND c.unidade_faturamento_id = ${unidadeFatFilter}::bigint
              )
         )
       ORDER BY p.nome ASC, r.id ASC
    `;
  }

  /**
   * Agregados por funcao para a folha detalhada de um prestador.
   */
  async findFolhaAgregadoPorFuncao(
    repasseId: bigint,
  ): Promise<FolhaAgregadoFuncaoRow[]> {
    const tx = this.prisma.tx();
    return await tx.$queryRaw<FolhaAgregadoFuncaoRow[]>`
      SELECT ri.funcao,
             COUNT(*)::int                     AS qtd,
             COALESCE(SUM(ri.valor_calculado), 0)::text AS valor
        FROM repasses_itens ri
       WHERE ri.repasse_id = ${repasseId}::bigint
         AND ri.glosado    = FALSE
       GROUP BY ri.funcao
       ORDER BY ri.funcao ASC
    `;
  }

  async findFolhaAgregadoPorCriterio(
    repasseId: bigint,
  ): Promise<FolhaAgregadoCriterioRow[]> {
    const tx = this.prisma.tx();
    return await tx.$queryRaw<FolhaAgregadoCriterioRow[]>`
      SELECT cr.uuid_externo::text AS criterio_uuid,
             cr.descricao          AS descricao,
             COUNT(*)::int                              AS qtd,
             COALESCE(SUM(ri.valor_calculado), 0)::text AS valor
        FROM repasses_itens ri
   LEFT JOIN criterios_repasse cr ON cr.id = ri.criterio_id
       WHERE ri.repasse_id = ${repasseId}::bigint
         AND ri.glosado    = FALSE
       GROUP BY cr.uuid_externo, cr.descricao
       ORDER BY cr.descricao ASC NULLS LAST
    `;
  }

  // ════════════════════════════════════════════════════════════════
  // TRILHA R-A — Apuração mensal de repasse
  // ════════════════════════════════════════════════════════════════

  /**
   * Roda um callback dentro de uma transação Prisma com `SET LOCAL
   * app.current_tenant_id` aplicado, simulando o que o
   * `TenantContextInterceptor` faz para HTTP. Usado pelo worker BullMQ
   * (que NÃO tem `RequestContext`).
   *
   * Importante: o caller também deve usar `RequestContextStorage.run()`
   * envolvendo `runWithTenant()` para que `prisma.tx()` continue
   * funcionando dentro da transação. O `apuracao-runner.service.ts`
   * faz esse setup.
   */
  async runWithTenant<T>(
    tenantId: bigint,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
      );
      return fn();
    });
  }

  /**
   * Localiza prestadores elegíveis a receber repasse:
   *   - `recebe_repasse = TRUE`
   *   - `tipo_vinculo != 'CLT'` (CLT recebe via folha, não repasse)
   *   - `deleted_at IS NULL`
   *   - filtro opcional por lista de IDs.
   */
  async findPrestadoresElegiveis(args: {
    prestadorIds?: bigint[];
  }): Promise<PrestadorElegivelRow[]> {
    const tx = this.prisma.tx();
    const ids = args.prestadorIds ?? null;
    const rows = await tx.$queryRaw<PrestadorElegivelRow[]>`
      SELECT p.id,
             p.uuid_externo::text AS uuid_externo,
             p.nome,
             p.tipo_vinculo::text AS tipo_vinculo
        FROM prestadores p
       WHERE p.deleted_at IS NULL
         AND p.recebe_repasse = TRUE
         AND p.tipo_vinculo <> 'CLT'::enum_prestador_tipo_vinculo
         AND (${ids}::bigint[] IS NULL OR p.id = ANY(${ids}::bigint[]))
       ORDER BY p.id
    `;
    return rows;
  }

  /**
   * Devolve os items de conta elegíveis para repasse de um prestador na
   * competência. Considera duas perspectivas:
   *   - executante direto (`contas_itens.prestador_executante_id`),
   *     funcao = 'EXECUTANTE';
   *   - membros da equipe da cirurgia (`cirurgias_equipe`), funcao do
   *     próprio registro de equipe.
   *
   * Filtros:
   *   - `contas.status = 'FATURADA'`;
   *   - `contas.data_fechamento` na competência;
   *   - `contas.convenio_id IS NOT NULL` (PARTICULAR/SUS pulam — RN-REP-04).
   */
  async findItensParaRepasse(args: {
    prestadorId: bigint;
    competencia: string; // YYYY-MM
  }): Promise<ContaItemElegivelRow[]> {
    const tx = this.prisma.tx();
    const compStart = `${args.competencia}-01`;
    const rows = await tx.$queryRaw<ContaItemElegivelRow[]>`
      WITH faixa AS (
        SELECT ${compStart}::date AS dt_ini,
               (date_trunc('month', ${compStart}::date) + interval '1 month - 1 day')::date AS dt_fim
      ),
      contas_validas AS (
        SELECT c.id, c.convenio_id
          FROM contas c, faixa f
         WHERE c.deleted_at IS NULL
           AND c.status = 'FATURADA'::enum_conta_status
           AND c.convenio_id IS NOT NULL
           AND c.data_fechamento::date BETWEEN f.dt_ini AND f.dt_fim
      )
      SELECT ci.conta_id,
             ci.id AS conta_item_id,
             NULL::bigint AS cirurgia_id,
             ci.procedimento_id,
             tp.codigo_tuss::text AS codigo_procedimento,
             ci.grupo_gasto::text AS grupo_gasto,
             'EXECUTANTE'::text AS funcao,
             ci.prestador_executante_id AS prestador_id,
             ci.data_realizacao,
             ci.valor_total::text AS valor_total,
             ci.valor_glosa::text AS valor_glosa,
             cv.convenio_id
        FROM contas_itens ci
        JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
        JOIN contas_validas cv        ON cv.id = ci.conta_id
       WHERE ci.deleted_at IS NULL
         AND ci.prestador_executante_id = ${args.prestadorId}::bigint

      UNION ALL

      SELECT ci.conta_id,
             ci.id AS conta_item_id,
             ce.cirurgia_id,
             ci.procedimento_id,
             tp.codigo_tuss::text AS codigo_procedimento,
             ci.grupo_gasto::text AS grupo_gasto,
             ce.funcao::text AS funcao,
             ce.prestador_id,
             ci.data_realizacao,
             ci.valor_total::text AS valor_total,
             ci.valor_glosa::text AS valor_glosa,
             cv.convenio_id
        FROM cirurgias_equipe ce
        JOIN cirurgias cir            ON cir.id = ce.cirurgia_id
        JOIN contas_itens ci          ON ci.conta_id = cir.conta_id
                                      AND (ce.conta_item_id IS NULL
                                           OR ce.conta_item_id = ci.id)
        JOIN tabelas_procedimentos tp ON tp.id = ci.procedimento_id
        JOIN contas_validas cv        ON cv.id = ci.conta_id
       WHERE ci.deleted_at IS NULL
         AND ce.prestador_id = ${args.prestadorId}::bigint
       ORDER BY 1, 2
    `;
    return rows;
  }

  /**
   * Critérios vigentes em `dataReferencia` (YYYY-MM-DD) para o tenant
   * atual. Ordenados por `prioridade DESC`. O caller aplica matchers e
   * usa o primeiro critério onde algum matcher casa.
   */
  async findCriteriosVigentesEm(
    dataReferencia: string,
  ): Promise<CriterioRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CriterioRow[]>`
      SELECT cr.id,
             cr.uuid_externo::text AS uuid_externo,
             cr.tenant_id,
             cr.descricao,
             cr.vigencia_inicio,
             cr.vigencia_fim,
             cr.unidade_faturamento_id,
             cr.unidade_atendimento_id,
             NULL::text AS unidade_faturamento_uuid,
             NULL::text AS unidade_atendimento_uuid,
             cr.tipo_base_calculo::text AS tipo_base_calculo,
             cr.momento_repasse::text   AS momento_repasse,
             cr.dia_fechamento,
             cr.prazo_dias,
             cr.prioridade,
             cr.regras,
             cr.ativo,
             cr.created_at,
             cr.updated_at
        FROM criterios_repasse cr
       WHERE cr.deleted_at IS NULL
         AND cr.ativo = TRUE
         AND cr.vigencia_inicio <= ${dataReferencia}::date
         AND (cr.vigencia_fim IS NULL OR cr.vigencia_fim >= ${dataReferencia}::date)
       ORDER BY cr.prioridade DESC, cr.id ASC
    `;
    return rows;
  }

  /**
   * Verifica existência de repasse para (tenant, prestador, competência).
   * Retorna `{ id, status }` ou null.
   */
  async findRepasseExistente(args: {
    prestadorId: bigint;
    competencia: string;
  }): Promise<{ id: bigint; status: RepasseStatus } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; status: string }[]>`
      SELECT id, status::text AS status
        FROM repasses
       WHERE prestador_id = ${args.prestadorId}::bigint
         AND competencia = ${args.competencia}
       LIMIT 1
    `;
    return rows.length === 0
      ? null
      : { id: rows[0].id, status: rows[0].status as RepasseStatus };
  }

  /**
   * Apaga TODOS os itens de um repasse (uso: forceReapuracao em status
   * APURADO). A trigger `tg_atualiza_totais_repasse` zera
   * `repasses.valor_*` quando o último item é removido.
   */
  async deleteRepasseItens(repasseId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      DELETE FROM repasses_itens WHERE repasse_id = ${repasseId}::bigint
    `;
  }

  /**
   * Atualiza apenas a `data_apuracao` na reapuração de um repasse APURADO
   * existente. Os totais vêm da trigger ao re-inserir os itens.
   */
  async resetRepasseParaReapuracao(repasseId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE repasses
         SET data_apuracao = now(),
             updated_at    = now()
       WHERE id = ${repasseId}::bigint
         AND status = 'APURADO'::enum_repasse_status
    `;
  }
}
