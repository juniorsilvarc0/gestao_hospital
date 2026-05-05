/**
 * `AtendimentoRepository` — fonte única de SQL do módulo atendimentos.
 *
 * Toda query usa `prisma.tx()`. RLS aplica via SET LOCAL feito pelo
 * `TenantContextInterceptor` (Fase 2).
 *
 * Razão para repository explícito: as rows de atendimentos têm muitos
 * JOINs (paciente, prestador, setor, unidade fat/aten, leito,
 * convênio, plano, agendamento, conta) e UUID externos resolvidos.
 * Concentra aqui mantém os use cases enxutos.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface AtendimentoRow {
  id: bigint;
  uuid_externo: string;
  numero_atendimento: string;
  paciente_id: bigint;
  paciente_uuid: string;
  paciente_nome: string;
  prestador_id: bigint;
  prestador_uuid: string;
  setor_id: bigint;
  setor_uuid: string;
  unidade_faturamento_id: bigint;
  unidade_faturamento_uuid: string;
  unidade_atendimento_id: bigint;
  unidade_atendimento_uuid: string;
  leito_id: bigint | null;
  leito_uuid: string | null;
  tipo: string;
  tipo_cobranca: string;
  paciente_convenio_id: bigint | null;
  convenio_id: bigint | null;
  convenio_uuid: string | null;
  plano_id: bigint | null;
  plano_uuid: string | null;
  numero_carteirinha: string | null;
  numero_guia_operadora: string | null;
  senha_autorizacao: string | null;
  classificacao_risco: string | null;
  classificacao_risco_em: Date | null;
  classificacao_risco_por: bigint | null;
  cid_principal: string | null;
  cids_secundarios: unknown;
  motivo_atendimento: string | null;
  tipo_alta: string | null;
  status: string;
  data_hora_entrada: Date;
  data_hora_saida: Date | null;
  agendamento_id: bigint | null;
  agendamento_uuid: string | null;
  atendimento_origem_id: bigint | null;
  atendimento_origem_uuid: string | null;
  conta_id: bigint | null;
  conta_uuid: string | null;
  observacao: string | null;
  created_at: Date;
  updated_at: Date | null;
  versao: number;
}

export interface TriagemRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint;
  atendimento_uuid: string;
  classificacao: string;
  protocolo: string;
  queixa_principal: string;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  fc: number | null;
  fr: number | null;
  temperatura: string | null;
  sat_o2: number | null;
  glicemia: number | null;
  peso_kg: string | null;
  altura_cm: number | null;
  dor_eva: number | null;
  observacao: string | null;
  triagem_em: Date;
  triagem_por: bigint;
  created_at: Date;
}

export interface ListAtendimentosParams {
  page: number;
  pageSize: number;
  pacienteId?: bigint;
  setorId?: bigint;
  prestadorId?: bigint;
  status?: string[];
  rangeInicio?: string;
  rangeFim?: string;
}

export interface FilaItemRow {
  uuid_externo: string;
  numero_atendimento: string;
  paciente_uuid: string;
  paciente_nome: string;
  classificacao_risco: string | null;
  status: string;
  data_hora_entrada: Date;
  tempo_espera_segundos: number;
}

const ATENDIMENTO_SELECT = Prisma.sql`
  SELECT
    a.id, a.uuid_externo, a.numero_atendimento,
    a.paciente_id,           p.uuid_externo::text  AS paciente_uuid,
                              p.nome                AS paciente_nome,
    a.prestador_id,          pr.uuid_externo::text AS prestador_uuid,
    a.setor_id,              s.uuid_externo::text  AS setor_uuid,
    a.unidade_faturamento_id, uf.uuid_externo::text AS unidade_faturamento_uuid,
    a.unidade_atendimento_id, ua.uuid_externo::text AS unidade_atendimento_uuid,
    a.leito_id,              l.uuid_externo::text  AS leito_uuid,
    a.tipo::text,
    a.tipo_cobranca::text,
    a.paciente_convenio_id,
    a.convenio_id, c.uuid_externo::text AS convenio_uuid,
    a.plano_id,    pl.uuid_externo::text AS plano_uuid,
    a.numero_carteirinha, a.numero_guia_operadora, a.senha_autorizacao,
    a.classificacao_risco::text,
    a.classificacao_risco_em,
    a.classificacao_risco_por,
    a.cid_principal, a.cids_secundarios,
    a.motivo_atendimento,
    a.tipo_alta::text,
    a.status::text,
    a.data_hora_entrada, a.data_hora_saida,
    a.agendamento_id, ag.uuid_externo::text AS agendamento_uuid,
    a.atendimento_origem_id, ao.uuid_externo::text AS atendimento_origem_uuid,
    a.conta_id, co.uuid_externo::text AS conta_uuid,
    a.observacao,
    a.created_at, a.updated_at, a.versao
  FROM atendimentos a
  JOIN pacientes p             ON p.id  = a.paciente_id
  JOIN prestadores pr          ON pr.id = a.prestador_id
  JOIN setores s               ON s.id  = a.setor_id
  JOIN unidades_faturamento uf ON uf.id = a.unidade_faturamento_id
  JOIN unidades_atendimento ua ON ua.id = a.unidade_atendimento_id
  LEFT JOIN leitos l           ON l.id  = a.leito_id
  LEFT JOIN convenios c        ON c.id  = a.convenio_id
  LEFT JOIN planos    pl       ON pl.id = a.plano_id
  LEFT JOIN agendamentos ag    ON ag.id = a.agendamento_id
  LEFT JOIN atendimentos ao    ON ao.id = a.atendimento_origem_id
  LEFT JOIN contas    co       ON co.id = a.conta_id
`;

@Injectable()
export class AtendimentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────── Lookups por UUID ─────────────────────────

  async findPacienteIdByUuid(
    uuid: string,
  ): Promise<{ id: bigint; cpfHash: string | null; cns: string | null } | null> {
    const tx = this.prisma.tx();
    // RN-ATE-01: paciente precisa de CPF OU CNS. `cpf_hash` é hash do
    // CPF criptografado em `cpf_encrypted`; `cns` está em texto claro.
    // Presença do hash/cns ≠ NULL atesta a existência do dado.
    const rows = await tx.$queryRaw<
      Array<{ id: bigint; cpf_hash: string | null; cns: string | null }>
    >`
      SELECT id, cpf_hash, cns
        FROM pacientes
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      cpfHash: rows[0].cpf_hash,
      cns: rows[0].cns,
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

  async findSetorIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM setores
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findUnidadeFaturamentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM unidades_faturamento
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findUnidadeAtendimentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM unidades_atendimento
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
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

  async findPlanoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM planos
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findAgendamentoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM agendamentos WHERE uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findProcedimentoByUuid(uuid: string): Promise<{
    id: bigint;
    precisa_autorizacao: boolean;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{ id: bigint; precisa_autorizacao: boolean }>
    >`
      SELECT id, precisa_autorizacao
        FROM tabelas_procedimentos
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findPacienteConvenioId(
    pacienteId: bigint,
    convenioId: bigint,
    numeroCarteirinha: string,
  ): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM pacientes_convenios
       WHERE paciente_id = ${pacienteId}::bigint
         AND convenio_id = ${convenioId}::bigint
         AND numero_carteirinha = ${numeroCarteirinha}
         AND ativo = TRUE
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  // ─────────────────────────── Atendimentos ────────────────────────

  async findAtendimentoByUuid(uuid: string): Promise<AtendimentoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<AtendimentoRow[]>(
      Prisma.sql`${ATENDIMENTO_SELECT} WHERE a.uuid_externo = ${uuid}::uuid AND a.deleted_at IS NULL LIMIT 1`,
    );
    return rows.length === 0 ? null : rows[0];
  }

  async findAtendimentoLockedByUuid(
    uuid: string,
  ): Promise<{ id: bigint; status: string; versao: number; leito_id: bigint | null; paciente_id: bigint } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{ id: bigint; status: string; versao: number; leito_id: bigint | null; paciente_id: bigint }>
    >`
      SELECT id, status::text AS status, versao, leito_id, paciente_id
        FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid AND deleted_at IS NULL
       FOR UPDATE
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listAtendimentos(
    params: ListAtendimentosParams,
  ): Promise<{ data: AtendimentoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (params.page - 1) * params.pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`a.deleted_at IS NULL`];

    if (params.pacienteId !== undefined) {
      where.push(Prisma.sql`a.paciente_id = ${params.pacienteId}::bigint`);
    }
    if (params.setorId !== undefined) {
      where.push(Prisma.sql`a.setor_id = ${params.setorId}::bigint`);
    }
    if (params.prestadorId !== undefined) {
      where.push(Prisma.sql`a.prestador_id = ${params.prestadorId}::bigint`);
    }
    if (params.rangeInicio !== undefined) {
      where.push(
        Prisma.sql`a.data_hora_entrada >= ${params.rangeInicio}::timestamptz`,
      );
    }
    if (params.rangeFim !== undefined) {
      where.push(
        Prisma.sql`a.data_hora_entrada < ${params.rangeFim}::timestamptz`,
      );
    }
    if (params.status !== undefined && params.status.length > 0) {
      const sanitized = params.status.filter((s) => /^[A-Z_]+$/.test(s));
      if (sanitized.length > 0) {
        const list = Prisma.join(
          sanitized.map((s) => Prisma.sql`${s}::enum_atendimento_status`),
          ', ',
        );
        where.push(Prisma.sql`a.status IN (${list})`);
      }
    }

    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM atendimentos a WHERE ${whereClause}`,
      ),
      tx.$queryRaw<AtendimentoRow[]>(
        Prisma.sql`
          ${ATENDIMENTO_SELECT}
          WHERE ${whereClause}
          ORDER BY a.data_hora_entrada DESC, a.id DESC
          LIMIT ${params.pageSize} OFFSET ${offset}
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }

  async listFila(setorId: bigint, limit: number): Promise<FilaItemRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<FilaItemRow[]>`
      SELECT
        a.uuid_externo,
        a.numero_atendimento,
        p.uuid_externo::text  AS paciente_uuid,
        p.nome                AS paciente_nome,
        a.classificacao_risco::text,
        a.status::text,
        a.data_hora_entrada,
        EXTRACT(EPOCH FROM (now() - a.data_hora_entrada))::INT AS tempo_espera_segundos
      FROM atendimentos a
      JOIN pacientes p ON p.id = a.paciente_id
      WHERE a.setor_id = ${setorId}::bigint
        AND a.status IN ('EM_ESPERA','EM_TRIAGEM','EM_ATENDIMENTO')
        AND a.deleted_at IS NULL
      ORDER BY
        CASE a.classificacao_risco
          WHEN 'VERMELHO' THEN 1
          WHEN 'LARANJA'  THEN 2
          WHEN 'AMARELO'  THEN 3
          WHEN 'VERDE'    THEN 4
          WHEN 'AZUL'     THEN 5
          ELSE 99
        END,
        a.data_hora_entrada
      LIMIT ${limit}::int
    `;
  }

  async insertAtendimento(input: {
    tenantId: bigint;
    numeroAtendimento: string;
    pacienteId: bigint;
    prestadorId: bigint;
    setorId: bigint;
    unidadeFaturamentoId: bigint;
    unidadeAtendimentoId: bigint;
    tipo: string;
    tipoCobranca: string;
    pacienteConvenioId: bigint | null;
    convenioId: bigint | null;
    planoId: bigint | null;
    numeroCarteirinha: string | null;
    numeroGuiaOperadora: string | null;
    senhaAutorizacao: string | null;
    motivoAtendimento: string | null;
    cidPrincipal: string | null;
    cidsSecundarios: string[] | null;
    agendamentoId: bigint | null;
    atendimentoOrigemId: bigint | null;
    observacao: string | null;
    statusInicial: string;
    createdBy: bigint;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const cidsJson =
      input.cidsSecundarios === null
        ? null
        : JSON.stringify(input.cidsSecundarios);
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO atendimentos (
        tenant_id, numero_atendimento, paciente_id, prestador_id,
        setor_id, unidade_faturamento_id, unidade_atendimento_id,
        tipo, tipo_cobranca,
        paciente_convenio_id, convenio_id, plano_id,
        numero_carteirinha, numero_guia_operadora, senha_autorizacao,
        motivo_atendimento, cid_principal, cids_secundarios,
        agendamento_id, atendimento_origem_id, observacao,
        status, created_by
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.numeroAtendimento},
        ${input.pacienteId}::bigint,
        ${input.prestadorId}::bigint,
        ${input.setorId}::bigint,
        ${input.unidadeFaturamentoId}::bigint,
        ${input.unidadeAtendimentoId}::bigint,
        ${input.tipo}::enum_atendimento_tipo,
        ${input.tipoCobranca}::enum_tipo_cobranca,
        ${input.pacienteConvenioId}::bigint,
        ${input.convenioId}::bigint,
        ${input.planoId}::bigint,
        ${input.numeroCarteirinha},
        ${input.numeroGuiaOperadora},
        ${input.senhaAutorizacao},
        ${input.motivoAtendimento},
        ${input.cidPrincipal},
        ${cidsJson}::jsonb,
        ${input.agendamentoId}::bigint,
        ${input.atendimentoOrigemId}::bigint,
        ${input.observacao},
        ${input.statusInicial}::enum_atendimento_status,
        ${input.createdBy}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async updateAtendimentoLight(
    id: bigint,
    patch: {
      cidPrincipal?: string | null;
      cidsSecundarios?: string[] | null;
      observacao?: string | null;
      motivoAtendimento?: string | null;
      numeroGuiaOperadora?: string | null;
      senhaAutorizacao?: string | null;
      updatedBy: bigint;
    },
  ): Promise<void> {
    const tx = this.prisma.tx();
    const sets: Prisma.Sql[] = [
      Prisma.sql`updated_at = now()`,
      Prisma.sql`updated_by = ${patch.updatedBy}::bigint`,
      Prisma.sql`versao = versao + 1`,
    ];
    if (patch.cidPrincipal !== undefined) {
      sets.push(Prisma.sql`cid_principal = ${patch.cidPrincipal}`);
    }
    if (patch.cidsSecundarios !== undefined) {
      const json =
        patch.cidsSecundarios === null
          ? null
          : JSON.stringify(patch.cidsSecundarios);
      sets.push(Prisma.sql`cids_secundarios = ${json}::jsonb`);
    }
    if (patch.observacao !== undefined) {
      sets.push(Prisma.sql`observacao = ${patch.observacao}`);
    }
    if (patch.motivoAtendimento !== undefined) {
      sets.push(Prisma.sql`motivo_atendimento = ${patch.motivoAtendimento}`);
    }
    if (patch.numeroGuiaOperadora !== undefined) {
      sets.push(
        Prisma.sql`numero_guia_operadora = ${patch.numeroGuiaOperadora}`,
      );
    }
    if (patch.senhaAutorizacao !== undefined) {
      sets.push(Prisma.sql`senha_autorizacao = ${patch.senhaAutorizacao}`);
    }

    await tx.$executeRaw(
      Prisma.sql`UPDATE atendimentos SET ${Prisma.join(sets, ', ')} WHERE id = ${id}::bigint`,
    );
  }

  async updateClassificacaoRisco(
    atendimentoId: bigint,
    classificacao: string,
    triagemPor: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE atendimentos
         SET classificacao_risco     = ${classificacao}::enum_atendimento_classificacao_risco,
             classificacao_risco_em  = now(),
             classificacao_risco_por = ${triagemPor}::bigint,
             status                  = CASE
                                         WHEN status IN ('EM_ESPERA','EM_TRIAGEM')
                                           THEN 'EM_ATENDIMENTO'::enum_atendimento_status
                                         ELSE status
                                       END,
             updated_at              = now(),
             updated_by              = ${triagemPor}::bigint,
             versao                  = versao + 1
       WHERE id = ${atendimentoId}::bigint
    `;
  }

  async setLeitoEStatusInternado(
    atendimentoId: bigint,
    leitoId: bigint,
    updatedBy: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE atendimentos
         SET leito_id   = ${leitoId}::bigint,
             status     = 'INTERNADO'::enum_atendimento_status,
             updated_at = now(),
             updated_by = ${updatedBy}::bigint,
             versao     = versao + 1
       WHERE id = ${atendimentoId}::bigint
    `;
  }

  async setLeitoNoAtendimento(
    atendimentoId: bigint,
    leitoId: bigint | null,
    updatedBy: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE atendimentos
         SET leito_id   = ${leitoId}::bigint,
             updated_at = now(),
             updated_by = ${updatedBy}::bigint,
             versao     = versao + 1
       WHERE id = ${atendimentoId}::bigint
    `;
  }

  async darAlta(
    atendimentoId: bigint,
    tipoAlta: string,
    cidPrincipal: string | null,
    motivo: string | null,
    updatedBy: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE atendimentos
         SET data_hora_saida = now(),
             status          = 'ALTA'::enum_atendimento_status,
             tipo_alta       = ${tipoAlta}::enum_atendimento_tipo_alta,
             cid_principal   = COALESCE(${cidPrincipal}, cid_principal),
             observacao      = CASE
                                 WHEN ${motivo}::text IS NULL THEN observacao
                                 ELSE COALESCE(observacao || E'\n', '') || 'ALTA: ' || ${motivo}::text
                               END,
             updated_at      = now(),
             updated_by      = ${updatedBy}::bigint,
             versao          = versao + 1
       WHERE id = ${atendimentoId}::bigint
    `;
  }

  async setStatusCancelado(
    atendimentoId: bigint,
    motivo: string,
    updatedBy: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE atendimentos
         SET status     = 'CANCELADO'::enum_atendimento_status,
             observacao = COALESCE(observacao || E'\n', '') || 'CANCELADO: ' || ${motivo}::text,
             deleted_at = now(),
             deleted_by = ${updatedBy}::bigint,
             updated_at = now(),
             updated_by = ${updatedBy}::bigint,
             versao     = versao + 1
       WHERE id = ${atendimentoId}::bigint
    `;
  }

  async setContaEmElaboracao(contaId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE contas
         SET status     = 'EM_ELABORACAO'::enum_conta_status,
             updated_at = now(),
             versao     = versao + 1
       WHERE id = ${contaId}::bigint
    `;
  }

  // ─────────────────────────── Triagens ─────────────────────────────

  async insertTriagem(input: {
    tenantId: bigint;
    atendimentoId: bigint;
    classificacao: string;
    queixaPrincipal: string;
    paSistolica: number | null;
    paDiastolica: number | null;
    fc: number | null;
    fr: number | null;
    temperatura: number | null;
    satO2: number | null;
    glicemia: number | null;
    pesoKg: number | null;
    alturaCm: number | null;
    dorEva: number | null;
    observacao: string | null;
    triagemPor: bigint;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO triagens (
        tenant_id, atendimento_id, classificacao, protocolo,
        queixa_principal, pa_sistolica, pa_diastolica, fc, fr,
        temperatura, sat_o2, glicemia, peso_kg, altura_cm, dor_eva,
        observacao, triagem_por
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.atendimentoId}::bigint,
        ${input.classificacao}::enum_atendimento_classificacao_risco,
        'MANCHESTER',
        ${input.queixaPrincipal},
        ${input.paSistolica}::int,
        ${input.paDiastolica}::int,
        ${input.fc}::int,
        ${input.fr}::int,
        ${input.temperatura}::numeric,
        ${input.satO2}::int,
        ${input.glicemia}::int,
        ${input.pesoKg}::numeric,
        ${input.alturaCm}::int,
        ${input.dorEva}::int,
        ${input.observacao},
        ${input.triagemPor}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async findTriagemByUuid(uuid: string): Promise<TriagemRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<TriagemRow[]>`
      SELECT
        t.id, t.uuid_externo,
        t.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        t.classificacao::text, t.protocolo, t.queixa_principal,
        t.pa_sistolica, t.pa_diastolica, t.fc, t.fr,
        t.temperatura::text AS temperatura,
        t.sat_o2, t.glicemia,
        t.peso_kg::text AS peso_kg,
        t.altura_cm, t.dor_eva,
        t.observacao, t.triagem_em, t.triagem_por, t.created_at
      FROM triagens t
      JOIN atendimentos a ON a.id = t.atendimento_id
      WHERE t.uuid_externo = ${uuid}::uuid LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listTriagens(
    page: number,
    pageSize: number,
    atendimentoId?: bigint,
  ): Promise<{ data: TriagemRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (page - 1) * pageSize;
    const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (atendimentoId !== undefined) {
      where.push(Prisma.sql`t.atendimento_id = ${atendimentoId}::bigint`);
    }
    const whereClause = Prisma.join(where, ' AND ');

    const [countRows, rows] = await Promise.all([
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::BIGINT AS total FROM triagens t WHERE ${whereClause}`,
      ),
      tx.$queryRaw<TriagemRow[]>(
        Prisma.sql`
          SELECT
            t.id, t.uuid_externo,
            t.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
            t.classificacao::text, t.protocolo, t.queixa_principal,
            t.pa_sistolica, t.pa_diastolica, t.fc, t.fr,
            t.temperatura::text AS temperatura,
            t.sat_o2, t.glicemia,
            t.peso_kg::text AS peso_kg,
            t.altura_cm, t.dor_eva,
            t.observacao, t.triagem_em, t.triagem_por, t.created_at
          FROM triagens t
          JOIN atendimentos a ON a.id = t.atendimento_id
          WHERE ${whereClause}
          ORDER BY t.triagem_em DESC, t.id DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
      ),
    ]);

    return {
      data: rows,
      total: countRows.length === 0 ? 0 : Number(countRows[0].total),
    };
  }
}
