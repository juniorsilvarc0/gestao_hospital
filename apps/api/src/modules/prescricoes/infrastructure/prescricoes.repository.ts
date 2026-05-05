/**
 * `PrescricoesRepository` — fonte única de SQL do módulo prescrições.
 *
 * Por que repository explícito? Quase tudo é particionado (RANGE
 * mensal) e exige PK composta `(id, data_hora)`. Encapsular aqui evita
 * que cada use case repita o join `prescricoes ↔ prescricoes_itens ↔
 * tabelas_procedimentos` e a resolução de UUIDs.
 *
 * RLS: todas as queries usam `prisma.tx()` — `SET LOCAL
 * app.current_tenant_id` já está aplicado pelo
 * `TenantContextInterceptor`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  PrescricaoItemResponse,
  PrescricaoResponse,
  PrescricaoStatus,
} from '../dto/list-prescricoes.dto';

export interface PrescricaoRow {
  id: bigint;
  data_hora: Date;
  uuid_externo: string;
  atendimento_id: bigint;
  paciente_id: bigint;
  prescritor_id: bigint;
  tenant_id: bigint;
  status: PrescricaoStatus;
  assinada_em: Date | null;
  validade_inicio: Date;
  validade_fim: Date | null;
  tipo: PrescricaoResponse['tipo'];
  observacao_geral: string | null;
  suspensa_em: Date | null;
  suspensa_motivo: string | null;
}

interface PrescricaoFullRow extends PrescricaoRow {
  atendimento_uuid: string;
  paciente_uuid: string;
  prescritor_uuid: string;
}

interface ItemRow {
  id: bigint;
  uuid_externo: string;
  prescricao_id: bigint;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  quantidade: string;
  unidade_medida: string | null;
  dose: string | null;
  via: string | null;
  frequencia: string | null;
  horarios: unknown;
  duracao_dias: number | null;
  urgente: boolean;
  se_necessario: boolean;
  observacao: string | null;
  alerta_alergia: unknown;
  alerta_interacao: unknown;
  alerta_dose_max: unknown;
  status_item: PrescricaoItemResponse['statusItem'];
}

@Injectable()
export class PrescricoesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAtendimentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; paciente_id: bigint }[]>`
      SELECT id, paciente_id FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findAtendimentoBasics(
    uuid: string,
  ): Promise<{ id: bigint; pacienteId: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; paciente_id: bigint }[]>`
      SELECT id, paciente_id FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    if (rows.length === 0) return null;
    return { id: rows[0].id, pacienteId: rows[0].paciente_id };
  }

  async findPrestadorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM prestadores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
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
       WHERE uuid_externo = ANY(${uuids}::uuid[])
    `;
    const out = new Map<string, { id: bigint; nome: string | null }>();
    for (const r of rows) out.set(r.uuid_externo, { id: r.id, nome: r.nome });
    return out;
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

  async findPrescricaoByUuid(uuid: string): Promise<PrescricaoFullRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PrescricaoFullRow[]>`
      SELECT p.id, p.data_hora, p.uuid_externo::text AS uuid_externo,
             p.atendimento_id, p.paciente_id, p.prescritor_id, p.tenant_id,
             p.status::text AS status, p.assinada_em,
             p.validade_inicio, p.validade_fim,
             p.tipo::text AS tipo, p.observacao_geral,
             p.suspensa_em, p.suspensa_motivo,
             a.uuid_externo::text AS atendimento_uuid,
             pa.uuid_externo::text AS paciente_uuid,
             pr.uuid_externo::text AS prescritor_uuid
        FROM prescricoes p
        JOIN atendimentos a ON a.id = p.atendimento_id
        JOIN pacientes pa  ON pa.id = p.paciente_id
        JOIN prestadores pr ON pr.id = p.prescritor_id
       WHERE p.uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findItensByPrescricaoId(prescricaoId: bigint): Promise<ItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ItemRow[]>`
      SELECT pi.id,
             pi.uuid_externo::text AS uuid_externo,
             pi.prescricao_id,
             pi.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             pi.quantidade::text AS quantidade,
             pi.unidade_medida,
             pi.dose, pi.via, pi.frequencia,
             pi.horarios,
             pi.duracao_dias, pi.urgente, pi.se_necessario,
             pi.observacao,
             pi.alerta_alergia, pi.alerta_interacao, pi.alerta_dose_max,
             pi.status_item
        FROM prescricoes_itens pi
        JOIN tabelas_procedimentos tp ON tp.id = pi.procedimento_id
       WHERE pi.prescricao_id = ${prescricaoId}::bigint
       ORDER BY pi.id ASC
    `;
    return rows;
  }

  async findItemByUuid(itemUuid: string): Promise<ItemRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ItemRow[]>`
      SELECT pi.id,
             pi.uuid_externo::text AS uuid_externo,
             pi.prescricao_id,
             pi.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             pi.quantidade::text AS quantidade,
             pi.unidade_medida,
             pi.dose, pi.via, pi.frequencia,
             pi.horarios,
             pi.duracao_dias, pi.urgente, pi.se_necessario,
             pi.observacao,
             pi.alerta_alergia, pi.alerta_interacao, pi.alerta_dose_max,
             pi.status_item
        FROM prescricoes_itens pi
        JOIN tabelas_procedimentos tp ON tp.id = pi.procedimento_id
       WHERE pi.uuid_externo = ${itemUuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listByAtendimento(input: {
    atendimentoId: bigint;
    page: number;
    pageSize: number;
    statuses?: PrescricaoStatus[];
  }): Promise<{ rows: PrescricaoFullRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (input.page - 1) * input.pageSize;
    const statusFilter = input.statuses ?? [];
    const useStatus = statusFilter.length > 0;

    const rows = useStatus
      ? await tx.$queryRaw<PrescricaoFullRow[]>`
          SELECT p.id, p.data_hora, p.uuid_externo::text AS uuid_externo,
                 p.atendimento_id, p.paciente_id, p.prescritor_id, p.tenant_id,
                 p.status::text AS status, p.assinada_em,
                 p.validade_inicio, p.validade_fim,
                 p.tipo::text AS tipo, p.observacao_geral,
                 p.suspensa_em, p.suspensa_motivo,
                 a.uuid_externo::text AS atendimento_uuid,
                 pa.uuid_externo::text AS paciente_uuid,
                 pr.uuid_externo::text AS prescritor_uuid
            FROM prescricoes p
            JOIN atendimentos a ON a.id = p.atendimento_id
            JOIN pacientes pa  ON pa.id = p.paciente_id
            JOIN prestadores pr ON pr.id = p.prescritor_id
           WHERE p.atendimento_id = ${input.atendimentoId}::bigint
             AND p.status::text = ANY(${statusFilter}::text[])
           ORDER BY p.data_hora DESC
           LIMIT ${input.pageSize}::int OFFSET ${offset}::int
        `
      : await tx.$queryRaw<PrescricaoFullRow[]>`
          SELECT p.id, p.data_hora, p.uuid_externo::text AS uuid_externo,
                 p.atendimento_id, p.paciente_id, p.prescritor_id, p.tenant_id,
                 p.status::text AS status, p.assinada_em,
                 p.validade_inicio, p.validade_fim,
                 p.tipo::text AS tipo, p.observacao_geral,
                 p.suspensa_em, p.suspensa_motivo,
                 a.uuid_externo::text AS atendimento_uuid,
                 pa.uuid_externo::text AS paciente_uuid,
                 pr.uuid_externo::text AS prescritor_uuid
            FROM prescricoes p
            JOIN atendimentos a ON a.id = p.atendimento_id
            JOIN pacientes pa  ON pa.id = p.paciente_id
            JOIN prestadores pr ON pr.id = p.prescritor_id
           WHERE p.atendimento_id = ${input.atendimentoId}::bigint
           ORDER BY p.data_hora DESC
           LIMIT ${input.pageSize}::int OFFSET ${offset}::int
        `;
    const totalRows = useStatus
      ? await tx.$queryRaw<{ total: bigint }[]>`
          SELECT COUNT(*)::bigint AS total
            FROM prescricoes
           WHERE atendimento_id = ${input.atendimentoId}::bigint
             AND status::text = ANY(${statusFilter}::text[])
        `
      : await tx.$queryRaw<{ total: bigint }[]>`
          SELECT COUNT(*)::bigint AS total
            FROM prescricoes
           WHERE atendimento_id = ${input.atendimentoId}::bigint
        `;
    const total =
      totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  /** Tipagem fraca propositadamente — repassada para presenter. */
  toItemRowExternal(r: ItemRow): ItemRow {
    return r;
  }
}
