/**
 * `PepRepository` — fonte única de SQL do módulo PEP.
 *
 * Cobre evoluções, sinais vitais e documentos emitidos. Usa
 * `prisma.tx()` (RLS aplica via `SET LOCAL` do `TenantContextInterceptor`).
 *
 * Tabelas particionadas (evoluções, sinais_vitais): garantimos que
 * `data_hora` está dentro de uma partição existente (Fase 6 cria
 * 2026-04..2026-07; job mensal cria as próximas).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

interface AtendimentoBasicRow {
  id: bigint;
  paciente_id: bigint;
  status: string;
  prestador_id: bigint;
}

export interface EvolucaoFullRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  profissional_id: bigint;
  profissional_uuid: string | null;
  tipo_profissional: string;
  tipo: string;
  data_hora: Date;
  conteudo: unknown;
  conteudo_html: string | null;
  texto_livre: string | null;
  cids: unknown;
  sinais_vitais: unknown;
  assinatura_digital: unknown;
  assinada_em: Date | null;
  versao_anterior_id: bigint | null;
  versao_anterior_uuid: string | null;
  created_at: Date;
  created_by: bigint;
}

export interface SinaisVitaisFullRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  registrado_por: bigint;
  data_hora: Date;
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
  valor_confirmado: boolean;
  justificativa: string | null;
  created_at: Date;
}

export interface DocumentoFullRow {
  id: bigint;
  uuid_externo: string;
  atendimento_id: bigint | null;
  atendimento_uuid: string | null;
  paciente_id: bigint;
  paciente_uuid: string | null;
  emissor_id: bigint;
  emissor_uuid: string | null;
  emissor_nome: string | null;
  tipo: string;
  conteudo: unknown;
  pdf_url: string | null;
  assinatura_digital: unknown;
  assinado_em: Date | null;
  data_emissao: Date;
  validade_dias: number | null;
  versao_anterior_id: bigint | null;
  created_at: Date;
}

@Injectable()
export class PepRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────
  // Helpers de resolução
  // ─────────────────────────────────────────────────────────────────
  async findAtendimentoBasic(uuid: string): Promise<AtendimentoBasicRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<AtendimentoBasicRow[]>`
      SELECT id, paciente_id, status::text AS status, prestador_id
        FROM atendimentos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findPrestadorIdByUser(userId: bigint): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ prestador_id: bigint | null }[]>`
      SELECT prestador_id FROM usuarios WHERE id = ${userId}::bigint LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0].prestador_id;
  }

  async findPrestadorBasic(prestadorId: bigint): Promise<{
    nome: string;
    registro_conselho: string | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { nome: string; registro_conselho: string | null }[]
    >`
      SELECT nome,
             (tipo_conselho::text || ' ' || numero_conselho || '/' || uf_conselho) AS registro_conselho
        FROM prestadores
       WHERE id = ${prestadorId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
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

  // ─────────────────────────────────────────────────────────────────
  // Evoluções
  // ─────────────────────────────────────────────────────────────────
  async insertEvolucaoRascunho(input: {
    tenantId: bigint;
    atendimentoId: bigint;
    pacienteId: bigint;
    profissionalId: bigint;
    tipoProfissional: string;
    tipo: string;
    conteudo: Record<string, unknown>;
    conteudoHtml: string;
    textoLivre: string;
    cids: unknown;
    sinaisVitaisInline: Record<string, unknown> | null;
    createdBy: bigint;
    versaoAnteriorId?: bigint | null;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO evolucoes (
        tenant_id, atendimento_id, paciente_id, profissional_id,
        tipo_profissional, tipo, data_hora, conteudo, conteudo_html,
        texto_livre, cids, sinais_vitais, versao_anterior_id, created_by
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.atendimentoId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.profissionalId}::bigint,
        ${input.tipoProfissional}::enum_evolucao_tipo_profissional,
        ${input.tipo}::enum_evolucao_tipo,
        now(),
        ${JSON.stringify(input.conteudo)}::jsonb,
        ${input.conteudoHtml},
        ${input.textoLivre},
        ${input.cids === null ? null : JSON.stringify(input.cids)}::jsonb,
        ${input.sinaisVitaisInline === null ? null : JSON.stringify(input.sinaisVitaisInline)}::jsonb,
        ${input.versaoAnteriorId ?? null}::bigint,
        ${input.createdBy}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async findEvolucaoByUuid(uuid: string): Promise<EvolucaoFullRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EvolucaoFullRow[]>`
      SELECT
        e.id, e.uuid_externo::text AS uuid_externo,
        e.atendimento_id,
        a.uuid_externo::text AS atendimento_uuid,
        e.paciente_id,
        p.uuid_externo::text AS paciente_uuid,
        e.profissional_id,
        pr.uuid_externo::text AS profissional_uuid,
        e.tipo_profissional::text AS tipo_profissional,
        e.tipo::text AS tipo,
        e.data_hora,
        e.conteudo,
        e.conteudo_html,
        e.texto_livre,
        e.cids,
        e.sinais_vitais,
        e.assinatura_digital,
        e.assinada_em,
        e.versao_anterior_id,
        ev_ant.uuid_externo::text AS versao_anterior_uuid,
        e.created_at, e.created_by
      FROM evolucoes e
      LEFT JOIN atendimentos a ON a.id = e.atendimento_id
      LEFT JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN prestadores pr ON pr.id = e.profissional_id
      LEFT JOIN evolucoes ev_ant ON ev_ant.id = e.versao_anterior_id
      WHERE e.uuid_externo = ${uuid}::uuid
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findEvolucaoSnapshot(uuid: string): Promise<{
    id: bigint;
    data_hora: Date;
    assinada_em: Date | null;
    conteudo: unknown;
    profissional_id: bigint;
    atendimento_id: bigint;
    paciente_id: bigint;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        data_hora: Date;
        assinada_em: Date | null;
        conteudo: unknown;
        profissional_id: bigint;
        atendimento_id: bigint;
        paciente_id: bigint;
      }>
    >`
      SELECT id, data_hora, assinada_em, conteudo, profissional_id, atendimento_id, paciente_id
        FROM evolucoes
       WHERE uuid_externo = ${uuid}::uuid
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listEvolucoesByAtendimento(
    atendimentoId: bigint,
    page: number,
    pageSize: number,
  ): Promise<{ rows: EvolucaoFullRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EvolucaoFullRow[]>`
      SELECT
        e.id, e.uuid_externo::text AS uuid_externo,
        e.atendimento_id,
        a.uuid_externo::text AS atendimento_uuid,
        e.paciente_id, p.uuid_externo::text AS paciente_uuid,
        e.profissional_id, pr.uuid_externo::text AS profissional_uuid,
        e.tipo_profissional::text, e.tipo::text,
        e.data_hora, e.conteudo, e.conteudo_html, e.texto_livre,
        e.cids, e.sinais_vitais, e.assinatura_digital, e.assinada_em,
        e.versao_anterior_id,
        ev_ant.uuid_externo::text AS versao_anterior_uuid,
        e.created_at, e.created_by
      FROM evolucoes e
      LEFT JOIN atendimentos a ON a.id = e.atendimento_id
      LEFT JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN prestadores pr ON pr.id = e.profissional_id
      LEFT JOIN evolucoes ev_ant ON ev_ant.id = e.versao_anterior_id
      WHERE e.atendimento_id = ${atendimentoId}::bigint
        AND e.deleted_at IS NULL
      ORDER BY e.data_hora DESC
      LIMIT ${pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM evolucoes
       WHERE atendimento_id = ${atendimentoId}::bigint AND deleted_at IS NULL
    `;
    return { rows, total: Number(totalRows[0].c) };
  }

  async updateEvolucaoRascunho(
    id: bigint,
    dataHora: Date,
    input: {
      conteudo?: Record<string, unknown>;
      conteudoHtml?: string;
      textoLivre?: string;
      cids?: unknown;
      sinaisVitais?: Record<string, unknown> | null;
      updatedBy: bigint;
    },
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE evolucoes
         SET conteudo      = COALESCE(${input.conteudo === undefined ? null : JSON.stringify(input.conteudo)}::jsonb, conteudo),
             conteudo_html = COALESCE(${input.conteudoHtml ?? null}, conteudo_html),
             texto_livre   = COALESCE(${input.textoLivre ?? null}, texto_livre),
             cids          = COALESCE(${input.cids === undefined ? null : JSON.stringify(input.cids)}::jsonb, cids),
             sinais_vitais = COALESCE(${input.sinaisVitais === undefined ? null : JSON.stringify(input.sinaisVitais)}::jsonb, sinais_vitais),
             updated_at    = now(),
             updated_by    = ${input.updatedBy}::bigint
       WHERE id = ${id}::bigint
         AND data_hora = ${dataHora}::timestamptz
    `;
  }

  async assinarEvolucao(
    id: bigint,
    dataHora: Date,
    assinatura: Record<string, unknown>,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE evolucoes
         SET assinatura_digital = ${JSON.stringify(assinatura)}::jsonb,
             assinada_em        = now()
       WHERE id = ${id}::bigint
         AND data_hora = ${dataHora}::timestamptz
         AND assinada_em IS NULL
    `;
  }

  // ─────────────────────────────────────────────────────────────────
  // Sinais vitais
  // ─────────────────────────────────────────────────────────────────
  async insertSinaisVitais(input: {
    tenantId: bigint;
    atendimentoId: bigint;
    pacienteId: bigint;
    registradoPor: bigint;
    dataHora: Date;
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
    valorConfirmado: boolean;
    justificativa: string | null;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO sinais_vitais (
        tenant_id, atendimento_id, paciente_id, registrado_por, data_hora,
        pa_sistolica, pa_diastolica, fc, fr, temperatura, sat_o2, glicemia,
        peso_kg, altura_cm, dor_eva, observacao, valor_confirmado, justificativa
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.atendimentoId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.registradoPor}::bigint,
        ${input.dataHora}::timestamptz,
        ${input.paSistolica}::int,
        ${input.paDiastolica}::int,
        ${input.fc}::int,
        ${input.fr}::int,
        ${input.temperatura}::numeric,
        ${input.satO2}::int,
        ${input.glicemia}::int,
        ${input.pesoKg}::numeric,
        ${input.alturaCm}::int,
        ${input.dorEva}::smallint,
        ${input.observacao},
        ${input.valorConfirmado},
        ${input.justificativa}
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async listSinaisVitais(
    atendimentoId: bigint,
    page: number,
    pageSize: number,
  ): Promise<{ rows: SinaisVitaisFullRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<SinaisVitaisFullRow[]>`
      SELECT
        sv.id, sv.uuid_externo::text AS uuid_externo,
        sv.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        sv.paciente_id, p.uuid_externo::text AS paciente_uuid,
        sv.registrado_por, sv.data_hora,
        sv.pa_sistolica, sv.pa_diastolica, sv.fc, sv.fr,
        sv.temperatura::text, sv.sat_o2, sv.glicemia,
        sv.peso_kg::text, sv.altura_cm, sv.dor_eva,
        sv.observacao, sv.valor_confirmado, sv.justificativa,
        sv.created_at
      FROM sinais_vitais sv
      LEFT JOIN atendimentos a ON a.id = sv.atendimento_id
      LEFT JOIN pacientes p ON p.id = sv.paciente_id
      WHERE sv.atendimento_id = ${atendimentoId}::bigint
      ORDER BY sv.data_hora DESC
      LIMIT ${pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM sinais_vitais
       WHERE atendimento_id = ${atendimentoId}::bigint
    `;
    return { rows, total: Number(totalRows[0].c) };
  }

  // ─────────────────────────────────────────────────────────────────
  // Documentos
  // ─────────────────────────────────────────────────────────────────
  async insertDocumento(input: {
    tenantId: bigint;
    atendimentoId: bigint | null;
    pacienteId: bigint;
    emissorId: bigint;
    tipo: string;
    conteudo: Record<string, unknown>;
    validadeDias: number | null;
  }): Promise<{ id: bigint; uuid_externo: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint; uuid_externo: string }[]>`
      INSERT INTO documentos_emitidos (
        tenant_id, atendimento_id, paciente_id, emissor_id, tipo,
        conteudo, validade_dias
      ) VALUES (
        ${input.tenantId}::bigint,
        ${input.atendimentoId}::bigint,
        ${input.pacienteId}::bigint,
        ${input.emissorId}::bigint,
        ${input.tipo}::enum_documento_tipo,
        ${JSON.stringify(input.conteudo)}::jsonb,
        ${input.validadeDias}::int
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    return rows[0];
  }

  async setDocumentoPdfUrl(id: bigint, pdfUrl: string): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE documentos_emitidos SET pdf_url = ${pdfUrl}
       WHERE id = ${id}::bigint AND assinado_em IS NULL
    `;
  }

  async assinarDocumento(
    id: bigint,
    assinatura: Record<string, unknown>,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE documentos_emitidos
         SET assinatura_digital = ${JSON.stringify(assinatura)}::jsonb,
             assinado_em        = now()
       WHERE id = ${id}::bigint
         AND assinado_em IS NULL
    `;
  }

  async findDocumentoByUuid(uuid: string): Promise<DocumentoFullRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<DocumentoFullRow[]>`
      SELECT
        d.id, d.uuid_externo::text AS uuid_externo,
        d.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        d.paciente_id, p.uuid_externo::text AS paciente_uuid,
        d.emissor_id, pr.uuid_externo::text AS emissor_uuid, pr.nome AS emissor_nome,
        d.tipo::text AS tipo, d.conteudo, d.pdf_url,
        d.assinatura_digital, d.assinado_em, d.data_emissao,
        d.validade_dias, d.versao_anterior_id, d.created_at
      FROM documentos_emitidos d
      LEFT JOIN atendimentos a ON a.id = d.atendimento_id
      LEFT JOIN pacientes p ON p.id = d.paciente_id
      LEFT JOIN prestadores pr ON pr.id = d.emissor_id
      WHERE d.uuid_externo = ${uuid}::uuid
      LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async listDocumentosByAtendimento(
    atendimentoId: bigint,
  ): Promise<DocumentoFullRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<DocumentoFullRow[]>`
      SELECT
        d.id, d.uuid_externo::text AS uuid_externo,
        d.atendimento_id, a.uuid_externo::text AS atendimento_uuid,
        d.paciente_id, p.uuid_externo::text AS paciente_uuid,
        d.emissor_id, pr.uuid_externo::text AS emissor_uuid, pr.nome AS emissor_nome,
        d.tipo::text AS tipo, d.conteudo, d.pdf_url,
        d.assinatura_digital, d.assinado_em, d.data_emissao,
        d.validade_dias, d.versao_anterior_id, d.created_at
      FROM documentos_emitidos d
      LEFT JOIN atendimentos a ON a.id = d.atendimento_id
      LEFT JOIN pacientes p ON p.id = d.paciente_id
      LEFT JOIN prestadores pr ON pr.id = d.emissor_id
      WHERE d.atendimento_id = ${atendimentoId}::bigint
      ORDER BY d.data_emissao DESC
      LIMIT 200
    `;
  }

  async existsResumoAltaAssinado(atendimentoId: bigint): Promise<boolean> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c
        FROM documentos_emitidos
       WHERE atendimento_id = ${atendimentoId}::bigint
         AND tipo = 'RESUMO_ALTA'::enum_documento_tipo
         AND assinado_em IS NOT NULL
    `;
    return Number(rows[0].c) > 0;
  }

  async findPacienteBasic(
    pacienteId: bigint,
  ): Promise<{ nome: string; data_nascimento: string | null } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { nome: string; data_nascimento: string | null }[]
    >`
      SELECT nome, to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento
        FROM pacientes
       WHERE id = ${pacienteId}::bigint AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }
}
