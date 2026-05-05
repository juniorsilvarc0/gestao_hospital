/**
 * `FarmaciaRepository` — fonte única de SQL do módulo farmácia.
 *
 * Particionamento: `dispensacoes` é particionado por mês em `data_hora`,
 * com PK composta `(id, data_hora)`. Cada UPDATE/DELETE precisa filtrar
 * tanto pelo `id` quanto por `data_hora`. O repositório encapsula esse
 * padrão para que os use cases não precisem se preocupar.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  DispensacaoStatus,
  DispensacaoTipo,
} from '../domain/dispensacao';
import type { LivroTipoMovimento } from '../domain/livro-controlados';

export interface DispensacaoRow {
  id: bigint;
  data_hora: Date;
  uuid_externo: string;
  tenant_id: bigint;
  atendimento_id: bigint;
  paciente_id: bigint;
  prescricao_id: bigint | null;
  prescricao_data_hora: Date | null;
  cirurgia_id: bigint | null;
  setor_destino_id: bigint | null;
  farmaceutico_id: bigint;
  turno: string | null;
  tipo: DispensacaoTipo;
  status: DispensacaoStatus;
  observacao: string | null;
  dispensacao_origem_id: bigint | null;
  dispensacao_origem_data_hora: Date | null;
}

export interface DispensacaoFullRow extends DispensacaoRow {
  atendimento_uuid: string;
  paciente_uuid: string;
  prescricao_uuid: string | null;
  cirurgia_uuid: string | null;
  setor_destino_uuid: string | null;
  farmaceutico_uuid: string;
  dispensacao_origem_uuid: string | null;
}

export interface DispensacaoItemRow {
  id: bigint;
  uuid_externo: string;
  dispensacao_id: bigint;
  dispensacao_data_hora: Date;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  procedimento_grupo_gasto: string;
  procedimento_controlado: boolean;
  procedimento_fator_conversao: string | null;
  prescricao_item_id: bigint | null;
  prescricao_item_uuid: string | null;
  quantidade_prescrita: string;
  quantidade_dispensada: string;
  unidade_medida: string | null;
  fator_conversao_aplicado: string | null;
  justificativa_divergencia: string | null;
  lote: string | null;
  validade: Date | null;
  conta_item_id: bigint | null;
  conta_item_uuid: string | null;
  status: DispensacaoStatus;
}

export interface InsertDispensacaoArgs {
  tenantId: bigint;
  atendimentoId: bigint;
  pacienteId: bigint;
  prescricaoId: bigint | null;
  prescricaoDataHora: Date | null;
  cirurgiaId: bigint | null;
  setorDestinoId: bigint | null;
  farmaceuticoId: bigint;
  dataHora: string; // ISO
  turno: string;
  tipo: DispensacaoTipo;
  observacao: string | null;
  dispensacaoOrigemId: bigint | null;
  dispensacaoOrigemDataHora: Date | null;
  userId: bigint;
}

export interface InsertDispensacaoItemArgs {
  tenantId: bigint;
  dispensacaoId: bigint;
  dispensacaoDataHora: Date;
  procedimentoId: bigint;
  prescricaoItemId: bigint | null;
  quantidadePrescrita: number;
  quantidadeDispensada: number;
  unidadeMedida: string | null;
  fatorConversaoAplicado: number | null;
  justificativaDivergencia: string | null;
  lote: string | null;
  validade: string | null;
}

@Injectable()
export class FarmaciaRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

  async findAtendimentoBasics(
    uuid: string,
  ): Promise<{ id: bigint; pacienteId: bigint; setorId: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; paciente_id: bigint; setor_id: bigint }[]
    >`
      SELECT id, paciente_id, setor_id FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      pacienteId: rows[0].paciente_id,
      setorId: rows[0].setor_id,
    };
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
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE usuario_id = ${usuarioId}::bigint AND deleted_at IS NULL
       LIMIT 1
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

  /**
   * Snapshot mínimo da prescrição usado pelo `CreateDispensacaoUseCase`
   * para validar status (RN-FAR-01) e capturar `prescricao_data_hora`
   * (PK composta).
   */
  async findPrescricaoMin(uuid: string): Promise<{
    id: bigint;
    dataHora: Date;
    status: string;
    atendimentoId: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        data_hora: Date;
        status: string;
        atendimento_id: bigint;
      }[]
    >`
      SELECT id, data_hora, status::text AS status, atendimento_id
        FROM prescricoes
       WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      dataHora: rows[0].data_hora,
      status: rows[0].status,
      atendimentoId: rows[0].atendimento_id,
    };
  }

  async findPrescricaoItemIds(
    uuids: string[],
  ): Promise<Map<string, { id: bigint; prescricaoId: bigint }>> {
    const out = new Map<string, { id: bigint; prescricaoId: bigint }>();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string; prescricao_id: bigint }[]
    >`
      SELECT id, uuid_externo::text AS uuid_externo, prescricao_id
        FROM prescricoes_itens
       WHERE uuid_externo = ANY(${uuids}::uuid[])
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, { id: r.id, prescricaoId: r.prescricao_id });
    }
    return out;
  }

  async findCirurgiaMin(uuid: string): Promise<{
    id: bigint;
    atendimentoId: bigint;
    pacienteId: bigint;
    kitCirurgicoId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        atendimento_id: bigint;
        paciente_id: bigint;
        kit_cirurgico_id: bigint | null;
      }[]
    >`
      SELECT id, atendimento_id, paciente_id, kit_cirurgico_id
        FROM cirurgias
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      atendimentoId: rows[0].atendimento_id,
      pacienteId: rows[0].paciente_id,
      kitCirurgicoId: rows[0].kit_cirurgico_id,
    };
  }

  async findKitItens(
    kitId: bigint,
  ): Promise<
    Array<{ procedimentoId: bigint; quantidade: string; obrigatorio: boolean }>
  > {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        procedimento_id: bigint;
        quantidade: string;
        obrigatorio: boolean;
      }[]
    >`
      SELECT procedimento_id,
             quantidade::text AS quantidade,
             obrigatorio
        FROM kits_cirurgicos_itens
       WHERE kit_id = ${kitId}::bigint
       ORDER BY id ASC
    `;
    return rows.map((r) => ({
      procedimentoId: r.procedimento_id,
      quantidade: r.quantidade,
      obrigatorio: r.obrigatorio,
    }));
  }

  async findProcedimentosByUuids(uuids: string[]): Promise<
    Map<
      string,
      {
        id: bigint;
        nome: string | null;
        grupoGasto: string;
        controlado: boolean;
        fatorConversao: string | null;
      }
    >
  > {
    const out = new Map<
      string,
      {
        id: bigint;
        nome: string | null;
        grupoGasto: string;
        controlado: boolean;
        fatorConversao: string | null;
      }
    >();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        uuid_externo: string;
        nome: string | null;
        grupo_gasto: string;
        controlado: boolean;
        fator_conversao: string | null;
      }[]
    >`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             nome,
             grupo_gasto::text AS grupo_gasto,
             controlado,
             fator_conversao::text AS fator_conversao
        FROM tabelas_procedimentos
       WHERE uuid_externo = ANY(${uuids}::uuid[])
         AND deleted_at IS NULL
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, {
        id: r.id,
        nome: r.nome,
        grupoGasto: r.grupo_gasto,
        controlado: r.controlado,
        fatorConversao: r.fator_conversao,
      });
    }
    return out;
  }

  async findProcedimentosByIds(ids: bigint[]): Promise<
    Map<
      bigint,
      {
        id: bigint;
        uuid: string;
        nome: string | null;
        grupoGasto: string;
        controlado: boolean;
        fatorConversao: string | null;
      }
    >
  > {
    const out = new Map<
      bigint,
      {
        id: bigint;
        uuid: string;
        nome: string | null;
        grupoGasto: string;
        controlado: boolean;
        fatorConversao: string | null;
      }
    >();
    if (ids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        uuid_externo: string;
        nome: string | null;
        grupo_gasto: string;
        controlado: boolean;
        fator_conversao: string | null;
      }[]
    >`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             nome,
             grupo_gasto::text AS grupo_gasto,
             controlado,
             fator_conversao::text AS fator_conversao
        FROM tabelas_procedimentos
       WHERE id = ANY(${ids}::bigint[])
         AND deleted_at IS NULL
    `;
    for (const r of rows) {
      out.set(r.id, {
        id: r.id,
        uuid: r.uuid_externo,
        nome: r.nome,
        grupoGasto: r.grupo_gasto,
        controlado: r.controlado,
        fatorConversao: r.fator_conversao,
      });
    }
    return out;
  }

  async findAtendimentoContaId(
    atendimentoId: bigint,
  ): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ conta_id: bigint | null }[]>`
      SELECT conta_id FROM atendimentos
       WHERE id = ${atendimentoId}::bigint LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0].conta_id;
  }

  // ────────── Inserts ──────────

  async insertDispensacao(args: InsertDispensacaoArgs): Promise<{
    id: bigint;
    dataHora: Date;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; data_hora: Date; uuid_externo: string }[]
    >`
      INSERT INTO dispensacoes (
        tenant_id, atendimento_id, paciente_id,
        prescricao_id, prescricao_data_hora, cirurgia_id,
        farmaceutico_id, setor_destino_id,
        data_hora, turno, tipo, status, observacao,
        dispensacao_origem_id, dispensacao_origem_data_hora,
        created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.atendimentoId}::bigint,
        ${args.pacienteId}::bigint,
        ${args.prescricaoId}::bigint,
        ${args.prescricaoDataHora}::timestamptz,
        ${args.cirurgiaId}::bigint,
        ${args.farmaceuticoId}::bigint,
        ${args.setorDestinoId}::bigint,
        ${args.dataHora}::timestamptz,
        ${args.turno},
        ${args.tipo}::enum_dispensacao_tipo,
        'PENDENTE'::enum_dispensacao_status,
        ${args.observacao},
        ${args.dispensacaoOrigemId}::bigint,
        ${args.dispensacaoOrigemDataHora}::timestamptz,
        ${args.userId}::bigint
      )
      RETURNING id, data_hora, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT dispensacoes não retornou linha.');
    }
    return {
      id: rows[0].id,
      dataHora: rows[0].data_hora,
      uuidExterno: rows[0].uuid_externo,
    };
  }

  async insertDispensacaoItem(
    args: InsertDispensacaoItemArgs,
  ): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO dispensacoes_itens (
        tenant_id, dispensacao_id, dispensacao_data_hora,
        procedimento_id, prescricao_item_id,
        quantidade_prescrita, quantidade_dispensada,
        unidade_medida, fator_conversao_aplicado,
        justificativa_divergencia, lote, validade, status
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.dispensacaoId}::bigint,
        ${args.dispensacaoDataHora}::timestamptz,
        ${args.procedimentoId}::bigint,
        ${args.prescricaoItemId}::bigint,
        ${args.quantidadePrescrita}::numeric,
        ${args.quantidadeDispensada}::numeric,
        ${args.unidadeMedida},
        ${args.fatorConversaoAplicado}::numeric,
        ${args.justificativaDivergencia},
        ${args.lote},
        ${args.validade}::date,
        'PENDENTE'::enum_dispensacao_status
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT dispensacoes_itens não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  // ────────── Updates ──────────

  async updateDispensacaoStatus(
    id: bigint,
    dataHora: Date,
    novoStatus: DispensacaoStatus,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE dispensacoes
         SET status = ${novoStatus}::enum_dispensacao_status,
             updated_at = now()
       WHERE id = ${id}::bigint
         AND data_hora = ${dataHora}::timestamptz
    `;
  }

  async updateDispensacaoItemStatus(
    itemId: bigint,
    novoStatus: DispensacaoStatus,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE dispensacoes_itens
         SET status = ${novoStatus}::enum_dispensacao_status
       WHERE id = ${itemId}::bigint
    `;
  }

  async updateDispensacaoItemSeparacao(
    itemId: bigint,
    lote: string | null,
    validade: string | null,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE dispensacoes_itens
         SET lote     = COALESCE(${lote}, lote),
             validade = COALESCE(${validade}::date, validade),
             status   = 'SEPARADA'::enum_dispensacao_status
       WHERE id = ${itemId}::bigint
    `;
  }

  async setDispensacaoItemContaId(
    itemId: bigint,
    contaItemId: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE dispensacoes_itens
         SET conta_item_id = ${contaItemId}::bigint,
             status        = 'DISPENSADA'::enum_dispensacao_status
       WHERE id = ${itemId}::bigint
    `;
  }

  async softDeleteContaItem(contaItemId: bigint, userId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas_itens
         SET deleted_at = now(),
             deleted_by = ${userId}::bigint
       WHERE id = ${contaItemId}::bigint
         AND deleted_at IS NULL
    `;
  }

  // ────────── Reads ──────────

  async findDispensacaoByUuid(
    uuid: string,
  ): Promise<DispensacaoFullRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<DispensacaoFullRow[]>`
      SELECT d.id, d.data_hora,
             d.uuid_externo::text AS uuid_externo,
             d.tenant_id, d.atendimento_id, d.paciente_id,
             d.prescricao_id, d.prescricao_data_hora,
             d.cirurgia_id, d.setor_destino_id, d.farmaceutico_id,
             d.turno, d.tipo::text AS tipo, d.status::text AS status,
             d.observacao,
             d.dispensacao_origem_id, d.dispensacao_origem_data_hora,
             a.uuid_externo::text  AS atendimento_uuid,
             pa.uuid_externo::text AS paciente_uuid,
             pr.uuid_externo::text AS prescricao_uuid,
             ci.uuid_externo::text AS cirurgia_uuid,
             se.uuid_externo::text AS setor_destino_uuid,
             pf.uuid_externo::text AS farmaceutico_uuid,
             dorig.uuid_externo::text AS dispensacao_origem_uuid
        FROM dispensacoes d
        JOIN atendimentos a   ON a.id = d.atendimento_id
        JOIN pacientes    pa  ON pa.id = d.paciente_id
        LEFT JOIN prescricoes pr ON pr.id = d.prescricao_id
                                AND pr.data_hora = d.prescricao_data_hora
        LEFT JOIN cirurgias ci   ON ci.id = d.cirurgia_id
        LEFT JOIN setores  se    ON se.id = d.setor_destino_id
        JOIN prestadores  pf     ON pf.id = d.farmaceutico_id
        LEFT JOIN dispensacoes dorig ON dorig.id = d.dispensacao_origem_id
                                 AND dorig.data_hora = d.dispensacao_origem_data_hora
       WHERE d.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findItensByDispensacaoId(
    dispensacaoId: bigint,
    dataHora: Date,
  ): Promise<DispensacaoItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<DispensacaoItemRow[]>`
      SELECT di.id,
             di.uuid_externo::text AS uuid_externo,
             di.dispensacao_id, di.dispensacao_data_hora,
             di.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             tp.grupo_gasto::text AS procedimento_grupo_gasto,
             tp.controlado AS procedimento_controlado,
             tp.fator_conversao::text AS procedimento_fator_conversao,
             di.prescricao_item_id,
             pi.uuid_externo::text AS prescricao_item_uuid,
             di.quantidade_prescrita::text AS quantidade_prescrita,
             di.quantidade_dispensada::text AS quantidade_dispensada,
             di.unidade_medida,
             di.fator_conversao_aplicado::text AS fator_conversao_aplicado,
             di.justificativa_divergencia,
             di.lote, di.validade,
             di.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid,
             di.status::text AS status
        FROM dispensacoes_itens di
        JOIN tabelas_procedimentos tp ON tp.id = di.procedimento_id
        LEFT JOIN prescricoes_itens pi ON pi.id = di.prescricao_item_id
        LEFT JOIN contas_itens ci ON ci.id = di.conta_item_id
       WHERE di.dispensacao_id = ${dispensacaoId}::bigint
         AND di.dispensacao_data_hora = ${dataHora}::timestamptz
       ORDER BY di.id ASC
    `;
    return rows;
  }

  /**
   * Lista para o painel: todas as dispensações com `status` em ('PENDENTE',
   * 'SEPARADA') no tenant atual. RLS garante isolamento.
   */
  async listForPainel(args: {
    statuses: DispensacaoStatus[];
    turno?: string;
    limit: number;
  }): Promise<DispensacaoFullRow[]> {
    const tx = this.prisma.tx();
    const turnoFilter = args.turno ?? null;
    const rows = await tx.$queryRaw<DispensacaoFullRow[]>`
      SELECT d.id, d.data_hora,
             d.uuid_externo::text AS uuid_externo,
             d.tenant_id, d.atendimento_id, d.paciente_id,
             d.prescricao_id, d.prescricao_data_hora,
             d.cirurgia_id, d.setor_destino_id, d.farmaceutico_id,
             d.turno, d.tipo::text AS tipo, d.status::text AS status,
             d.observacao,
             d.dispensacao_origem_id, d.dispensacao_origem_data_hora,
             a.uuid_externo::text  AS atendimento_uuid,
             pa.uuid_externo::text AS paciente_uuid,
             pr.uuid_externo::text AS prescricao_uuid,
             ci.uuid_externo::text AS cirurgia_uuid,
             se.uuid_externo::text AS setor_destino_uuid,
             pf.uuid_externo::text AS farmaceutico_uuid,
             dorig.uuid_externo::text AS dispensacao_origem_uuid
        FROM dispensacoes d
        JOIN atendimentos a   ON a.id = d.atendimento_id
        JOIN pacientes    pa  ON pa.id = d.paciente_id
        LEFT JOIN prescricoes pr ON pr.id = d.prescricao_id
                                AND pr.data_hora = d.prescricao_data_hora
        LEFT JOIN cirurgias ci   ON ci.id = d.cirurgia_id
        LEFT JOIN setores  se    ON se.id = d.setor_destino_id
        JOIN prestadores  pf     ON pf.id = d.farmaceutico_id
        LEFT JOIN dispensacoes dorig ON dorig.id = d.dispensacao_origem_id
                                 AND dorig.data_hora = d.dispensacao_origem_data_hora
       WHERE d.status::text = ANY(${args.statuses}::text[])
         AND (${turnoFilter}::text IS NULL OR d.turno = ${turnoFilter})
       ORDER BY d.data_hora ASC
       LIMIT ${args.limit}::int
    `;
    return rows;
  }

  // ────────── Livro de controlados ──────────

  /**
   * Saldo atual do par (procedimento, lote). Retorna `null` se nunca
   * houve movimento (saldo zero implícito).
   */
  async findSaldoAtual(
    procedimentoId: bigint,
    lote: string,
  ): Promise<{ saldoAtual: string } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ saldo_atual: string }[]>`
      SELECT saldo_atual::text AS saldo_atual
        FROM livro_controlados
       WHERE procedimento_id = ${procedimentoId}::bigint
         AND lote            = ${lote}
       ORDER BY data_hora DESC, id DESC
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { saldoAtual: rows[0].saldo_atual };
  }

  async insertMovimentoControlado(args: {
    tenantId: bigint;
    procedimentoId: bigint;
    lote: string;
    quantidade: string;
    saldoAnterior: string;
    saldoAtual: string;
    tipoMovimento: LivroTipoMovimento;
    pacienteId: bigint | null;
    prescricaoId: bigint | null;
    prescricaoDataHora: Date | null;
    dispensacaoItemId: bigint | null;
    receitaDocumentoUrl: string | null;
    farmaceuticoId: bigint;
    observacao: string | null;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO livro_controlados (
        tenant_id, data_hora, procedimento_id, lote, quantidade,
        saldo_anterior, saldo_atual, tipo_movimento,
        paciente_id, prescricao_id, prescricao_data_hora,
        dispensacao_item_id, receita_documento_url,
        farmaceutico_id, observacao
      ) VALUES (
        ${args.tenantId}::bigint,
        now(),
        ${args.procedimentoId}::bigint,
        ${args.lote},
        ${args.quantidade}::numeric,
        ${args.saldoAnterior}::numeric,
        ${args.saldoAtual}::numeric,
        ${args.tipoMovimento}::enum_livro_controlados_movimento,
        ${args.pacienteId}::bigint,
        ${args.prescricaoId}::bigint,
        ${args.prescricaoDataHora}::timestamptz,
        ${args.dispensacaoItemId}::bigint,
        ${args.receitaDocumentoUrl},
        ${args.farmaceuticoId}::bigint,
        ${args.observacao}
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT livro_controlados não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async listLivro(args: {
    procedimentoId?: bigint;
    lote?: string;
    tipoMovimento?: LivroTipoMovimento;
    page: number;
    pageSize: number;
  }): Promise<{
    rows: Array<{
      id: bigint;
      uuid_externo: string;
      data_hora: Date;
      procedimento_id: bigint;
      procedimento_uuid: string;
      procedimento_nome: string | null;
      lote: string;
      quantidade: string;
      saldo_anterior: string;
      saldo_atual: string;
      tipo_movimento: LivroTipoMovimento;
      paciente_id: bigint | null;
      paciente_uuid: string | null;
      prescricao_id: bigint | null;
      dispensacao_item_id: bigint | null;
      dispensacao_item_uuid: string | null;
      receita_documento_url: string | null;
      farmaceutico_id: bigint;
      farmaceutico_uuid: string;
      observacao: string | null;
    }>;
    total: number;
  }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const procFilter = args.procedimentoId ?? null;
    const loteFilter = args.lote ?? null;
    const tipoFilter = args.tipoMovimento ?? null;

    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        uuid_externo: string;
        data_hora: Date;
        procedimento_id: bigint;
        procedimento_uuid: string;
        procedimento_nome: string | null;
        lote: string;
        quantidade: string;
        saldo_anterior: string;
        saldo_atual: string;
        tipo_movimento: LivroTipoMovimento;
        paciente_id: bigint | null;
        paciente_uuid: string | null;
        prescricao_id: bigint | null;
        dispensacao_item_id: bigint | null;
        dispensacao_item_uuid: string | null;
        receita_documento_url: string | null;
        farmaceutico_id: bigint;
        farmaceutico_uuid: string;
        observacao: string | null;
      }>
    >`
      SELECT lc.id,
             lc.uuid_externo::text AS uuid_externo,
             lc.data_hora,
             lc.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             lc.lote,
             lc.quantidade::text     AS quantidade,
             lc.saldo_anterior::text AS saldo_anterior,
             lc.saldo_atual::text    AS saldo_atual,
             lc.tipo_movimento::text AS tipo_movimento,
             lc.paciente_id,
             pa.uuid_externo::text   AS paciente_uuid,
             lc.prescricao_id,
             lc.dispensacao_item_id,
             di.uuid_externo::text   AS dispensacao_item_uuid,
             lc.receita_documento_url,
             lc.farmaceutico_id,
             pf.uuid_externo::text   AS farmaceutico_uuid,
             lc.observacao
        FROM livro_controlados lc
        JOIN tabelas_procedimentos tp ON tp.id = lc.procedimento_id
        LEFT JOIN pacientes pa        ON pa.id = lc.paciente_id
        LEFT JOIN dispensacoes_itens di ON di.id = lc.dispensacao_item_id
        JOIN prestadores pf           ON pf.id = lc.farmaceutico_id
       WHERE (${procFilter}::bigint IS NULL OR lc.procedimento_id = ${procFilter}::bigint)
         AND (${loteFilter}::text IS NULL OR lc.lote = ${loteFilter})
         AND (${tipoFilter}::text IS NULL
              OR lc.tipo_movimento::text = ${tipoFilter}::text)
       ORDER BY lc.data_hora DESC, lc.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM livro_controlados
       WHERE (${procFilter}::bigint IS NULL OR procedimento_id = ${procFilter}::bigint)
         AND (${loteFilter}::text   IS NULL OR lote = ${loteFilter})
         AND (${tipoFilter}::text   IS NULL OR tipo_movimento::text = ${tipoFilter}::text)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ────────── Contas itens (Fase 8 popula valores; aqui só inserimos
  //              o esqueleto a partir da dispensação confirmada). ──────────

  async insertContaItem(args: {
    tenantId: bigint;
    contaId: bigint;
    procedimentoId: bigint;
    grupoGasto: string;
    quantidade: string;
    setorId: bigint | null;
    lote: string | null;
    validade: string | null;
    origemReferenciaId: bigint;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO contas_itens (
        tenant_id, conta_id, procedimento_id, grupo_gasto,
        origem, origem_referencia_id, origem_referencia_tipo,
        quantidade, setor_id, lote, validade_lote, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.contaId}::bigint,
        ${args.procedimentoId}::bigint,
        ${args.grupoGasto}::enum_grupo_gasto,
        'FARMACIA'::enum_conta_origem_item,
        ${args.origemReferenciaId}::bigint,
        'dispensacao_item',
        ${args.quantidade}::numeric,
        ${args.setorId}::bigint,
        ${args.lote},
        ${args.validade}::date,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT contas_itens não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }
}
