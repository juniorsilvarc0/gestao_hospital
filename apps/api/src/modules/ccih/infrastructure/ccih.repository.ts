/**
 * `CcihRepository` — fonte única de SQL para o módulo CCIH.
 *
 * RLS: usamos `prisma.tx()` — o `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  AntibiogramaEntry,
  ResistenciaResultado,
} from '../domain/antibiograma';
import type { CcihCasoStatus, CcihOrigemInfeccao } from '../domain/caso';

export interface CcihCasoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  paciente_id: bigint;
  paciente_uuid: string;
  paciente_nome: string | null;
  atendimento_id: bigint;
  atendimento_uuid: string;
  setor_id: bigint;
  setor_uuid: string;
  setor_nome: string | null;
  leito_id: bigint | null;
  leito_uuid: string | null;
  leito_codigo: string | null;
  data_diagnostico: Date;
  topografia: string | null;
  cid: string | null;
  microorganismo: string | null;
  cultura_origem: string | null;
  resistencia: AntibiogramaEntry[] | null;
  origem_infeccao: CcihOrigemInfeccao;
  notificacao_compulsoria: boolean;
  data_notificacao: Date | null;
  resultado: string | null;
  status: CcihCasoStatus;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface InsertCasoArgs {
  tenantId: bigint;
  pacienteId: bigint;
  atendimentoId: bigint;
  setorId: bigint;
  leitoId: bigint | null;
  dataDiagnostico: string; // YYYY-MM-DD
  topografia: string | null;
  cid: string | null;
  microorganismo: string | null;
  culturaOrigem: string | null;
  resistencia: AntibiogramaEntry[] | null;
  origemInfeccao: CcihOrigemInfeccao;
  observacao: string | null;
  userId: bigint;
}

@Injectable()
export class CcihRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups ──────────

  async findPacienteIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findAtendimentoByUuid(uuid: string): Promise<{
    id: bigint;
    pacienteId: bigint;
    setorId: bigint;
    leitoId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        paciente_id: bigint;
        setor_id: bigint;
        leito_id: bigint | null;
      }[]
    >`
      SELECT id, paciente_id, setor_id, leito_id
        FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      pacienteId: rows[0].paciente_id,
      setorId: rows[0].setor_id,
      leitoId: rows[0].leito_id,
    };
  }

  async findSetorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM setores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findLeitoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM leitos
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ────────── CRUD casos ──────────

  async insertCaso(args: InsertCasoArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    const resistenciaJson =
      args.resistencia === null ? null : JSON.stringify(args.resistencia);
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO ccih_casos (
        tenant_id, paciente_id, atendimento_id, setor_id, leito_id,
        data_diagnostico, topografia, cid, microorganismo, cultura_origem,
        resistencia, origem_infeccao, observacao, status, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.pacienteId}::bigint,
        ${args.atendimentoId}::bigint,
        ${args.setorId}::bigint,
        ${args.leitoId},
        ${args.dataDiagnostico}::date,
        ${args.topografia},
        ${args.cid},
        ${args.microorganismo},
        ${args.culturaOrigem},
        ${resistenciaJson}::jsonb,
        ${args.origemInfeccao}::enum_ccih_origem_infeccao,
        ${args.observacao},
        'ABERTO'::enum_ccih_caso_status,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT ccih_casos não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async findCasoByUuid(uuid: string): Promise<CcihCasoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CcihCasoRow[]>`
      SELECT cc.id,
             cc.uuid_externo::text AS uuid_externo,
             cc.tenant_id,
             cc.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome              AS paciente_nome,
             cc.atendimento_id,
             at.uuid_externo::text AS atendimento_uuid,
             cc.setor_id,
             se.uuid_externo::text AS setor_uuid,
             se.nome              AS setor_nome,
             cc.leito_id,
             le.uuid_externo::text AS leito_uuid,
             le.codigo            AS leito_codigo,
             cc.data_diagnostico,
             cc.topografia,
             cc.cid,
             cc.microorganismo,
             cc.cultura_origem,
             cc.resistencia,
             cc.origem_infeccao::text AS origem_infeccao,
             cc.notificacao_compulsoria,
             cc.data_notificacao,
             cc.resultado,
             cc.status::text AS status,
             cc.observacao,
             cc.created_at,
             cc.updated_at
        FROM ccih_casos cc
        JOIN pacientes    pa ON pa.id = cc.paciente_id
        JOIN atendimentos at ON at.id = cc.atendimento_id
        JOIN setores      se ON se.id = cc.setor_id
        LEFT JOIN leitos  le ON le.id = cc.leito_id
       WHERE cc.uuid_externo = ${uuid}::uuid
         AND cc.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listCasos(args: {
    statuses?: CcihCasoStatus[];
    origem?: CcihOrigemInfeccao;
    pacienteId?: bigint;
    setorId?: bigint;
    microorganismo?: string;
    dataInicio?: string;
    dataFim?: string;
    notificacaoCompulsoria?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CcihCasoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusFilter =
      args.statuses === undefined || args.statuses.length === 0
        ? null
        : args.statuses;
    const origemFilter = args.origem ?? null;
    const pacienteFilter = args.pacienteId ?? null;
    const setorFilter = args.setorId ?? null;
    const microorg = args.microorganismo ?? null;
    const dInicio = args.dataInicio ?? null;
    const dFim = args.dataFim ?? null;
    const notif = args.notificacaoCompulsoria ?? null;

    const rows = await tx.$queryRaw<CcihCasoRow[]>`
      SELECT cc.id,
             cc.uuid_externo::text AS uuid_externo,
             cc.tenant_id,
             cc.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome              AS paciente_nome,
             cc.atendimento_id,
             at.uuid_externo::text AS atendimento_uuid,
             cc.setor_id,
             se.uuid_externo::text AS setor_uuid,
             se.nome              AS setor_nome,
             cc.leito_id,
             le.uuid_externo::text AS leito_uuid,
             le.codigo            AS leito_codigo,
             cc.data_diagnostico,
             cc.topografia,
             cc.cid,
             cc.microorganismo,
             cc.cultura_origem,
             cc.resistencia,
             cc.origem_infeccao::text AS origem_infeccao,
             cc.notificacao_compulsoria,
             cc.data_notificacao,
             cc.resultado,
             cc.status::text AS status,
             cc.observacao,
             cc.created_at,
             cc.updated_at
        FROM ccih_casos cc
        JOIN pacientes    pa ON pa.id = cc.paciente_id
        JOIN atendimentos at ON at.id = cc.atendimento_id
        JOIN setores      se ON se.id = cc.setor_id
        LEFT JOIN leitos  le ON le.id = cc.leito_id
       WHERE cc.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR cc.status::text = ANY(${statusFilter}::text[]))
         AND (${origemFilter}::text IS NULL
              OR cc.origem_infeccao::text = ${origemFilter}::text)
         AND (${pacienteFilter}::bigint IS NULL OR cc.paciente_id = ${pacienteFilter}::bigint)
         AND (${setorFilter}::bigint IS NULL OR cc.setor_id = ${setorFilter}::bigint)
         AND (${microorg}::text IS NULL
              OR cc.microorganismo ILIKE '%' || ${microorg}::text || '%')
         AND (${dInicio}::date IS NULL OR cc.data_diagnostico >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR cc.data_diagnostico <= ${dFim}::date)
         AND (${notif}::bool IS NULL
              OR cc.notificacao_compulsoria = ${notif}::bool)
       ORDER BY cc.data_diagnostico DESC, cc.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM ccih_casos cc
       WHERE cc.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR cc.status::text = ANY(${statusFilter}::text[]))
         AND (${origemFilter}::text IS NULL
              OR cc.origem_infeccao::text = ${origemFilter}::text)
         AND (${pacienteFilter}::bigint IS NULL OR cc.paciente_id = ${pacienteFilter}::bigint)
         AND (${setorFilter}::bigint IS NULL OR cc.setor_id = ${setorFilter}::bigint)
         AND (${microorg}::text IS NULL
              OR cc.microorganismo ILIKE '%' || ${microorg}::text || '%')
         AND (${dInicio}::date IS NULL OR cc.data_diagnostico >= ${dInicio}::date)
         AND (${dFim}::date    IS NULL OR cc.data_diagnostico <= ${dFim}::date)
         AND (${notif}::bool IS NULL
              OR cc.notificacao_compulsoria = ${notif}::bool)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async updateCaso(args: {
    id: bigint;
    leitoId: bigint | null | undefined;
    /** Quando o caller deseja explicitamente nullar o leito, passa `setLeitoNull = true`. */
    setLeitoNull: boolean;
    topografia: string | null | undefined;
    cid: string | null | undefined;
    microorganismo: string | null | undefined;
    culturaOrigem: string | null | undefined;
    resistencia: AntibiogramaEntry[] | null | undefined;
    origemInfeccao: CcihOrigemInfeccao | undefined;
    observacao: string | null | undefined;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const resistenciaJson =
      args.resistencia === undefined
        ? null
        : args.resistencia === null
          ? null
          : JSON.stringify(args.resistencia);
    const setResistencia = args.resistencia !== undefined;
    const setLeito = args.setLeitoNull || args.leitoId !== undefined;
    const leitoVal = args.setLeitoNull ? null : args.leitoId ?? null;
    await tx.$executeRaw`
      UPDATE ccih_casos
         SET topografia      = COALESCE(${args.topografia ?? null}, topografia),
             cid             = COALESCE(${args.cid ?? null}, cid),
             microorganismo  = COALESCE(${args.microorganismo ?? null}, microorganismo),
             cultura_origem  = COALESCE(${args.culturaOrigem ?? null}, cultura_origem),
             origem_infeccao = COALESCE(
               ${args.origemInfeccao ?? null}::enum_ccih_origem_infeccao,
               origem_infeccao
             ),
             observacao      = COALESCE(${args.observacao ?? null}, observacao),
             leito_id        = CASE WHEN ${setLeito}::bool THEN ${leitoVal}::bigint ELSE leito_id END,
             resistencia     = CASE WHEN ${setResistencia}::bool THEN ${resistenciaJson}::jsonb ELSE resistencia END,
             updated_at      = now()
       WHERE id = ${args.id}::bigint
         AND deleted_at IS NULL
    `;
  }

  async updateStatusCaso(args: {
    id: bigint;
    status: CcihCasoStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE ccih_casos
         SET status     = ${args.status}::enum_ccih_caso_status,
             updated_at = now()
       WHERE id = ${args.id}::bigint
         AND deleted_at IS NULL
    `;
  }

  async updateNotificarCaso(args: {
    id: bigint;
    status: CcihCasoStatus;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE ccih_casos
         SET notificacao_compulsoria = TRUE,
             data_notificacao        = now(),
             status                  = ${args.status}::enum_ccih_caso_status,
             updated_at              = now()
       WHERE id = ${args.id}::bigint
         AND deleted_at IS NULL
    `;
  }

  async updateEncerrarCaso(args: {
    id: bigint;
    resultado: string;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE ccih_casos
         SET status     = 'ENCERRADO'::enum_ccih_caso_status,
             resultado  = ${args.resultado},
             observacao = COALESCE(${args.observacao}, observacao),
             updated_at = now()
       WHERE id = ${args.id}::bigint
         AND deleted_at IS NULL
    `;
  }

  // ────────── Painel epidemiológico ──────────

  async painelTotalCasos(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<{
    total: number;
    abertos: number;
    encerrados: number;
    notificacoesCompulsorias: number;
  }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        total: bigint;
        abertos: bigint;
        encerrados: bigint;
        notificacoes: bigint;
      }[]
    >`
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE status IN ('ABERTO','EM_TRATAMENTO','NOTIFICADO'))::bigint AS abertos,
             COUNT(*) FILTER (WHERE status = 'ENCERRADO')::bigint AS encerrados,
             COUNT(*) FILTER (WHERE notificacao_compulsoria = TRUE)::bigint AS notificacoes
        FROM ccih_casos
       WHERE deleted_at IS NULL
         AND data_diagnostico >= ${competenciaInicio}::date
         AND data_diagnostico <= ${competenciaFim}::date
    `;
    if (rows.length === 0) {
      return { total: 0, abertos: 0, encerrados: 0, notificacoesCompulsorias: 0 };
    }
    return {
      total: Number(rows[0].total),
      abertos: Number(rows[0].abertos),
      encerrados: Number(rows[0].encerrados),
      notificacoesCompulsorias: Number(rows[0].notificacoes),
    };
  }

  async painelCasosPorSetor(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<
    {
      setorUuid: string;
      setorNome: string;
      qtdCasos: number;
    }[]
  > {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { setor_uuid: string; setor_nome: string; qtd: bigint }[]
    >`
      SELECT s.uuid_externo::text AS setor_uuid,
             s.nome               AS setor_nome,
             COUNT(*)::bigint     AS qtd
        FROM ccih_casos cc
        JOIN setores s ON s.id = cc.setor_id
       WHERE cc.deleted_at IS NULL
         AND cc.data_diagnostico >= ${competenciaInicio}::date
         AND cc.data_diagnostico <= ${competenciaFim}::date
       GROUP BY s.uuid_externo, s.nome
       ORDER BY qtd DESC
    `;
    return rows.map((r) => ({
      setorUuid: r.setor_uuid,
      setorNome: r.setor_nome,
      qtdCasos: Number(r.qtd),
    }));
  }

  /**
   * Estimativa simples de paciente-dias por setor no período: soma dos
   * dias de internação cobertos pelos atendimentos cuja janela
   * (data_hora_entrada → COALESCE(data_hora_saida, periodo_fim)) cruza
   * a competência. Usado para a taxa de IRAS por 1000 paciente-dias.
   */
  async painelPacienteDiasPorSetor(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<Map<string, number>> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { setor_uuid: string; paciente_dias: number }[]
    >`
      SELECT s.uuid_externo::text AS setor_uuid,
             COALESCE(SUM(
               GREATEST(
                 0,
                 EXTRACT(
                   EPOCH FROM (
                     LEAST(
                       COALESCE(at.data_hora_saida, ${competenciaFim}::date + INTERVAL '1 day'),
                       ${competenciaFim}::date + INTERVAL '1 day'
                     )
                     -
                     GREATEST(at.data_hora_entrada, ${competenciaInicio}::timestamptz)
                   )
                 ) / 86400.0
               )
             ), 0)::float AS paciente_dias
        FROM atendimentos at
        JOIN setores s ON s.id = at.setor_id
       WHERE at.deleted_at IS NULL
         AND at.tipo IN ('INTERNACAO','OBSERVACAO','PRONTO_ATENDIMENTO')
         AND at.data_hora_entrada <= (${competenciaFim}::date + INTERVAL '1 day')
         AND COALESCE(at.data_hora_saida, NOW()) >= ${competenciaInicio}::timestamptz
       GROUP BY s.uuid_externo
    `;
    const out = new Map<string, number>();
    for (const r of rows) {
      out.set(r.setor_uuid, Number(r.paciente_dias));
    }
    return out;
  }

  async painelTopografias(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<{ topografia: string; qtd: number }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ topografia: string; qtd: bigint }[]>`
      SELECT cc.topografia, COUNT(*)::bigint AS qtd
        FROM ccih_casos cc
       WHERE cc.deleted_at IS NULL
         AND cc.topografia IS NOT NULL
         AND cc.data_diagnostico >= ${competenciaInicio}::date
         AND cc.data_diagnostico <= ${competenciaFim}::date
       GROUP BY cc.topografia
       ORDER BY qtd DESC
       LIMIT 5
    `;
    return rows.map((r) => ({ topografia: r.topografia, qtd: Number(r.qtd) }));
  }

  async painelMicroorganismos(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<{ nome: string; qtd: number }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ microorganismo: string; qtd: bigint }[]>`
      SELECT cc.microorganismo, COUNT(*)::bigint AS qtd
        FROM ccih_casos cc
       WHERE cc.deleted_at IS NULL
         AND cc.microorganismo IS NOT NULL
         AND cc.data_diagnostico >= ${competenciaInicio}::date
         AND cc.data_diagnostico <= ${competenciaFim}::date
       GROUP BY cc.microorganismo
       ORDER BY qtd DESC
       LIMIT 10
    `;
    return rows.map((r) => ({ nome: r.microorganismo, qtd: Number(r.qtd) }));
  }

  async painelOrigem(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<{ origem: CcihOrigemInfeccao; qtd: number }[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ origem: string; qtd: bigint }[]>`
      SELECT cc.origem_infeccao::text AS origem, COUNT(*)::bigint AS qtd
        FROM ccih_casos cc
       WHERE cc.deleted_at IS NULL
         AND cc.data_diagnostico >= ${competenciaInicio}::date
         AND cc.data_diagnostico <= ${competenciaFim}::date
       GROUP BY cc.origem_infeccao
    `;
    return rows.map((r) => ({
      origem: r.origem as CcihOrigemInfeccao,
      qtd: Number(r.qtd),
    }));
  }

  /**
   * Agrega o antibiograma (campo JSONB) de todos os casos do período.
   * Usa `jsonb_array_elements` para "achatar" o array.
   */
  async painelResistencias(
    competenciaInicio: string,
    competenciaFim: string,
  ): Promise<
    {
      antibiotico: string;
      totalTestes: number;
      totalResistente: number;
    }[]
  > {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        antibiotico: string;
        total_testes: bigint;
        total_resistente: bigint;
      }[]
    >`
      SELECT UPPER(elem->>'antibiotico')         AS antibiotico,
             COUNT(*)::bigint                    AS total_testes,
             COUNT(*) FILTER (WHERE elem->>'resultado' = 'RESISTENTE')::bigint
                                                 AS total_resistente
        FROM ccih_casos cc
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(cc.resistencia, '[]'::jsonb)) AS elem
       WHERE cc.deleted_at IS NULL
         AND cc.data_diagnostico >= ${competenciaInicio}::date
         AND cc.data_diagnostico <= ${competenciaFim}::date
         AND elem->>'antibiotico' IS NOT NULL
       GROUP BY UPPER(elem->>'antibiotico')
       ORDER BY total_testes DESC
       LIMIT 30
    `;
    return rows.map((r) => ({
      antibiotico: r.antibiotico,
      totalTestes: Number(r.total_testes),
      totalResistente: Number(r.total_resistente),
    }));
  }

  // ────────── Contatos de risco (RN-CCI-01) ──────────

  /**
   * Busca pacientes que estiveram no mesmo setor OU no mesmo leito do
   * caso, dentro de uma janela `[inicio, fim]`. Exclui o próprio
   * paciente do caso.
   */
  async findContatosRisco(args: {
    excludePacienteId: bigint;
    setorId: bigint;
    leitoId: bigint | null;
    inicioIso: string;
    fimIso: string;
  }): Promise<
    {
      pacienteUuid: string;
      pacienteNome: string | null;
      atendimentoUuid: string;
      setorUuid: string | null;
      setorNome: string | null;
      leitoUuid: string | null;
      leitoCodigo: string | null;
      dataInicio: Date | null;
      dataFim: Date | null;
      motivo: 'MESMO_SETOR' | 'MESMO_LEITO';
    }[]
  > {
    const tx = this.prisma.tx();
    const leitoFilter = args.leitoId ?? null;

    const rows = await tx.$queryRaw<
      {
        paciente_uuid: string;
        paciente_nome: string | null;
        atendimento_uuid: string;
        setor_uuid: string | null;
        setor_nome: string | null;
        leito_uuid: string | null;
        leito_codigo: string | null;
        data_inicio: Date | null;
        data_fim: Date | null;
        motivo: 'MESMO_SETOR' | 'MESMO_LEITO';
      }[]
    >`
      SELECT pa.uuid_externo::text AS paciente_uuid,
             pa.nome               AS paciente_nome,
             at.uuid_externo::text AS atendimento_uuid,
             se.uuid_externo::text AS setor_uuid,
             se.nome               AS setor_nome,
             le.uuid_externo::text AS leito_uuid,
             le.codigo             AS leito_codigo,
             at.data_hora_entrada  AS data_inicio,
             at.data_hora_saida    AS data_fim,
             CASE
               WHEN ${leitoFilter}::bigint IS NOT NULL AND at.leito_id = ${leitoFilter}::bigint
                 THEN 'MESMO_LEITO'
               ELSE 'MESMO_SETOR'
             END                   AS motivo
        FROM atendimentos at
        JOIN pacientes pa ON pa.id = at.paciente_id
        LEFT JOIN setores se ON se.id = at.setor_id
        LEFT JOIN leitos  le ON le.id = at.leito_id
       WHERE at.deleted_at IS NULL
         AND at.paciente_id <> ${args.excludePacienteId}::bigint
         AND (
           at.setor_id = ${args.setorId}::bigint
           OR (${leitoFilter}::bigint IS NOT NULL AND at.leito_id = ${leitoFilter}::bigint)
         )
         -- Janela: [inicio, fim] sobrepõe o atendimento.
         AND at.data_hora_entrada <= ${args.fimIso}::timestamptz
         AND COALESCE(at.data_hora_saida, NOW()) >= ${args.inicioIso}::timestamptz
       ORDER BY data_inicio DESC, at.id DESC
       LIMIT 200
    `;
    return rows.map((r) => ({
      pacienteUuid: r.paciente_uuid,
      pacienteNome: r.paciente_nome,
      atendimentoUuid: r.atendimento_uuid,
      setorUuid: r.setor_uuid,
      setorNome: r.setor_nome,
      leitoUuid: r.leito_uuid,
      leitoCodigo: r.leito_codigo,
      dataInicio: r.data_inicio,
      dataFim: r.data_fim,
      motivo: r.motivo,
    }));
  }
}

// re-export for convenience to consumers
export type { ResistenciaResultado };
