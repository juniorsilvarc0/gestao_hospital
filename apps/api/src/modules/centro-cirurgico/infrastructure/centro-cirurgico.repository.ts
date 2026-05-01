/**
 * `CentroCirurgicoRepository` — fonte única de SQL do módulo de Centro
 * Cirúrgico (cirurgias, equipe, kits, gabaritos).
 *
 * RLS: usamos `prisma.tx()` — `TenantContextInterceptor` já aplicou
 * `SET LOCAL app.current_tenant_id` antes de chamar o handler.
 *
 * Convenção: o repositório expõe `Args` tipados explícitos para cada
 * operação de escrita; queries de leitura retornam `Row`s achatados que
 * são convertidos pelos presenters em `Response` DTOs.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import type {
  CirurgiaClassificacao,
  CirurgiaStatus,
  CirurgiaTipoAnestesia,
} from '../domain/cirurgia';

export interface CirurgiaRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  atendimento_id: bigint;
  atendimento_uuid: string;
  paciente_id: bigint;
  paciente_uuid: string;
  paciente_nome: string | null;
  procedimento_principal_id: bigint;
  procedimento_principal_uuid: string;
  procedimento_principal_nome: string | null;
  procedimentos_secundarios: unknown;
  sala_id: bigint;
  sala_uuid: string;
  sala_nome: string;
  setor_id: bigint | null;
  setor_uuid: string | null;
  data_hora_agendada: Date;
  duracao_estimada_minutos: number | null;
  data_hora_inicio: Date | null;
  data_hora_fim: Date | null;
  cirurgiao_id: bigint;
  cirurgiao_uuid: string;
  cirurgiao_nome: string | null;
  tipo_anestesia: CirurgiaTipoAnestesia | null;
  classificacao_cirurgia: CirurgiaClassificacao;
  exige_autorizacao_convenio: boolean;
  kit_cirurgico_id: bigint | null;
  kit_cirurgico_uuid: string | null;
  caderno_gabarito_id: bigint | null;
  caderno_gabarito_uuid: string | null;
  ficha_cirurgica: unknown;
  ficha_anestesica: unknown;
  intercorrencias: string | null;
  status: CirurgiaStatus;
  conta_id: bigint | null;
  conta_uuid: string | null;
  opme_solicitada: unknown;
  opme_autorizada: unknown;
  opme_utilizada: unknown;
  cancelamento_motivo: string | null;
  cancelado_em: Date | null;
}

export interface EquipeRow {
  id: bigint;
  cirurgia_id: bigint;
  prestador_id: bigint;
  prestador_uuid: string;
  prestador_nome: string | null;
  funcao: string;
  ordem: number;
  conta_item_id: bigint | null;
  conta_item_uuid: string | null;
}

export interface KitRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface KitItemRow {
  id: bigint;
  kit_id: bigint;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  quantidade: string;
  obrigatorio: boolean;
}

export interface GabaritoRow {
  id: bigint;
  uuid_externo: string;
  tenant_id: bigint;
  procedimento_principal_id: bigint;
  procedimento_principal_uuid: string;
  procedimento_principal_nome: string | null;
  cirurgiao_id: bigint | null;
  cirurgiao_uuid: string | null;
  cirurgiao_nome: string | null;
  versao: number;
  ativo: boolean;
  observacao: string | null;
}

export interface GabaritoItemRow {
  id: bigint;
  caderno_id: bigint;
  procedimento_id: bigint;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  procedimento_grupo_gasto: string;
  quantidade_padrao: string;
  obrigatorio: boolean;
  observacao: string | null;
}

export interface InsertCirurgiaArgs {
  tenantId: bigint;
  atendimentoId: bigint;
  pacienteId: bigint;
  procedimentoPrincipalId: bigint;
  procedimentosSecundarios: unknown;
  salaId: bigint;
  dataHoraAgendada: string;
  duracaoEstimadaMinutos: number;
  cirurgiaoId: bigint;
  tipoAnestesia: CirurgiaTipoAnestesia | null;
  classificacaoCirurgia: CirurgiaClassificacao;
  exigeAutorizacaoConvenio: boolean;
  kitCirurgicoId: bigint | null;
  cadernoGabaritoId: bigint | null;
  userId: bigint;
}

@Injectable()
export class CentroCirurgicoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ────────── Lookups básicos ──────────

  async findAtendimentoBasics(uuid: string): Promise<{
    id: bigint;
    pacienteId: bigint;
    setorId: bigint;
    contaId: bigint | null;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        paciente_id: bigint;
        setor_id: bigint;
        conta_id: bigint | null;
      }[]
    >`
      SELECT id, paciente_id, setor_id, conta_id
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
      contaId: rows[0].conta_id,
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

  async findPrestadorIdsByUuids(
    uuids: string[],
  ): Promise<Map<string, { id: bigint; nome: string | null }>> {
    const out = new Map<string, { id: bigint; nome: string | null }>();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string; nome_completo: string | null }[]
    >`
      SELECT id, uuid_externo::text AS uuid_externo, nome_completo
        FROM prestadores
       WHERE uuid_externo = ANY(${uuids}::uuid[])
         AND deleted_at IS NULL
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, { id: r.id, nome: r.nome_completo });
    }
    return out;
  }

  async findSalaByUuid(uuid: string): Promise<{
    id: bigint;
    setorId: bigint;
    nome: string;
  } | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; setor_id: bigint; nome: string }[]
    >`
      SELECT id, setor_id, nome FROM salas_cirurgicas
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
         AND ativa = TRUE
       LIMIT 1
    `;
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      setorId: rows[0].setor_id,
      nome: rows[0].nome,
    };
  }

  async findKitIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM kits_cirurgicos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findGabaritoIdByUuid(uuid: string): Promise<bigint | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM cadernos_gabaritos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0].id;
  }

  async findProcedimentosByUuids(uuids: string[]): Promise<
    Map<
      string,
      {
        id: bigint;
        nome: string | null;
        grupoGasto: string;
        tipo: string;
      }
    >
  > {
    const out = new Map<
      string,
      { id: bigint; nome: string | null; grupoGasto: string; tipo: string }
    >();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        uuid_externo: string;
        nome: string | null;
        grupo_gasto: string;
        tipo: string;
      }[]
    >`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             nome,
             grupo_gasto::text AS grupo_gasto,
             tipo::text AS tipo
        FROM tabelas_procedimentos
       WHERE uuid_externo = ANY(${uuids}::uuid[])
         AND ativo = TRUE
    `;
    for (const r of rows) {
      out.set(r.uuid_externo, {
        id: r.id,
        nome: r.nome,
        grupoGasto: r.grupo_gasto,
        tipo: r.tipo,
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
        tipo: string;
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
        tipo: string;
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
        tipo: string;
      }[]
    >`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             nome,
             grupo_gasto::text AS grupo_gasto,
             tipo::text AS tipo
        FROM tabelas_procedimentos
       WHERE id = ANY(${ids}::bigint[])
    `;
    for (const r of rows) {
      out.set(r.id, {
        id: r.id,
        uuid: r.uuid_externo,
        nome: r.nome,
        grupoGasto: r.grupo_gasto,
        tipo: r.tipo,
      });
    }
    return out;
  }

  // ────────── Cirurgias ──────────

  /**
   * Verifica conflito de sala num intervalo `[start, end)`. Considera
   * apenas cirurgias em status que ocupam a sala. Aceita exclusão por
   * cirurgia atual (caso de update).
   */
  async findSalaConflicts(args: {
    salaId: bigint;
    start: string;
    end: string;
    excludeCirurgiaId?: bigint;
  }): Promise<
    Array<{ id: bigint; uuid_externo: string; data_hora_inicio: Date | null }>
  > {
    const tx = this.prisma.tx();
    const exclude = args.excludeCirurgiaId ?? null;
    const rows = await tx.$queryRaw<
      Array<{ id: bigint; uuid_externo: string; data_hora_inicio: Date | null }>
    >`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             data_hora_inicio
        FROM cirurgias
       WHERE sala_id = ${args.salaId}::bigint
         AND deleted_at IS NULL
         AND status IN ('AGENDADA','CONFIRMADA','EM_ANDAMENTO')
         AND tstzrange(
               COALESCE(data_hora_inicio, data_hora_agendada),
               COALESCE(
                 data_hora_fim,
                 data_hora_agendada
                   + (COALESCE(duracao_estimada_minutos, 60) || ' minutes')::interval
               ),
               '[)'
             )
             && tstzrange(${args.start}::timestamptz, ${args.end}::timestamptz, '[)')
         AND (${exclude}::bigint IS NULL OR id <> ${exclude}::bigint)
       ORDER BY data_hora_agendada ASC
       LIMIT 5
    `;
    return rows;
  }

  async insertCirurgia(args: InsertCirurgiaArgs): Promise<{
    id: bigint;
    uuidExterno: string;
  }> {
    const tx = this.prisma.tx();
    // Empacota a flag `exige_autorizacao_convenio` (RN-CC-02) dentro do
    // JSONB `procedimentos_secundarios` como `{ _meta, items }`. Não há
    // coluna dedicada no schema P0 e a instrução proíbe alterá-lo.
    const procSecundariosJson = this.packProcSecundarios({
      items: args.procedimentosSecundarios,
      exigeAutorizacaoConvenio: args.exigeAutorizacaoConvenio,
    });
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO cirurgias (
        tenant_id, atendimento_id, paciente_id,
        procedimento_principal_id, procedimentos_secundarios,
        sala_id, data_hora_agendada, duracao_estimada_minutos,
        cirurgiao_id, tipo_anestesia, classificacao_cirurgia,
        kit_cirurgico_id, caderno_gabarito_id,
        status, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.atendimentoId}::bigint,
        ${args.pacienteId}::bigint,
        ${args.procedimentoPrincipalId}::bigint,
        ${procSecundariosJson}::jsonb,
        ${args.salaId}::bigint,
        ${args.dataHoraAgendada}::timestamptz,
        ${args.duracaoEstimadaMinutos}::int,
        ${args.cirurgiaoId}::bigint,
        ${args.tipoAnestesia}::enum_cirurgia_tipo_anestesia,
        ${args.classificacaoCirurgia}::enum_cirurgia_classificacao,
        ${args.kitCirurgicoId}::bigint,
        ${args.cadernoGabaritoId}::bigint,
        'AGENDADA'::enum_cirurgia_status,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cirurgias não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async updateCirurgiaStatus(
    cirurgiaId: bigint,
    novoStatus: CirurgiaStatus,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET status     = ${novoStatus}::enum_cirurgia_status,
             updated_at = now()
       WHERE id = ${cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaInicio(
    cirurgiaId: bigint,
    dataHoraInicio: string,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET data_hora_inicio = ${dataHoraInicio}::timestamptz,
             status           = 'EM_ANDAMENTO'::enum_cirurgia_status,
             updated_at       = now()
       WHERE id = ${cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaEncerramento(args: {
    cirurgiaId: bigint;
    dataHoraFim: string;
    intercorrencias: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET data_hora_fim   = ${args.dataHoraFim}::timestamptz,
             intercorrencias = COALESCE(${args.intercorrencias}, intercorrencias),
             status          = 'CONCLUIDA'::enum_cirurgia_status,
             updated_at      = now()
       WHERE id = ${args.cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaCancelamento(args: {
    cirurgiaId: bigint;
    motivo: string;
    userId: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET status              = 'CANCELADA'::enum_cirurgia_status,
             cancelado_em        = now(),
             cancelado_por       = ${args.userId}::bigint,
             cancelamento_motivo = ${args.motivo},
             updated_at          = now()
       WHERE id = ${args.cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaFichaCirurgica(args: {
    cirurgiaId: bigint;
    ficha: Record<string, unknown>;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET ficha_cirurgica = ${JSON.stringify(args.ficha)}::jsonb,
             updated_at      = now()
       WHERE id = ${args.cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaFichaAnestesica(args: {
    cirurgiaId: bigint;
    ficha: Record<string, unknown>;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET ficha_anestesica = ${JSON.stringify(args.ficha)}::jsonb,
             updated_at       = now()
       WHERE id = ${args.cirurgiaId}::bigint
    `;
  }

  async updateCirurgiaPatch(args: {
    cirurgiaId: bigint;
    procedimentoPrincipalId?: bigint | null;
    procedimentosSecundarios?: unknown;
    procedimentosSecundariosTouched: boolean;
    salaId?: bigint | null;
    dataHoraAgendada?: string | null;
    duracaoEstimadaMinutos?: number | null;
    cirurgiaoId?: bigint | null;
    tipoAnestesia?: CirurgiaTipoAnestesia | null;
    tipoAnestesiaTouched: boolean;
    classificacaoCirurgia?: CirurgiaClassificacao | null;
    kitCirurgicoId?: bigint | null;
    kitCirurgicoTouched: boolean;
    cadernoGabaritoId?: bigint | null;
    cadernoGabaritoTouched: boolean;
    exigeAutorizacaoConvenio?: boolean | null;
    exigeAutorizacaoConvenioTouched: boolean;
  }): Promise<void> {
    const tx = this.prisma.tx();
    // Para preservar a coexistência da flag `_meta` com os items, sempre
    // que `procedimentosSecundarios` ou `exigeAutorizacaoConvenio` mudar
    // re-empacotamos lendo a linha atual.
    let procSecJson: string | null = null;
    let procSecTouched = false;
    if (
      args.procedimentosSecundariosTouched ||
      args.exigeAutorizacaoConvenioTouched
    ) {
      const current = await tx.$queryRaw<
        { procedimentos_secundarios: unknown }[]
      >`
        SELECT procedimentos_secundarios
          FROM cirurgias
         WHERE id = ${args.cirurgiaId}::bigint
         LIMIT 1
      `;
      const currentVal =
        current.length > 0 ? current[0].procedimentos_secundarios : null;
      const unpacked = this.unpackProcSecundarios(currentVal);
      const items = args.procedimentosSecundariosTouched
        ? args.procedimentosSecundarios ?? null
        : unpacked.items;
      const flag = args.exigeAutorizacaoConvenioTouched
        ? args.exigeAutorizacaoConvenio === true
        : unpacked.exigeAutorizacaoConvenio;
      procSecJson = this.packProcSecundarios({
        items,
        exigeAutorizacaoConvenio: flag,
      });
      procSecTouched = true;
    }
    const tipoAnesTouched = args.tipoAnestesiaTouched;
    const kitTouched = args.kitCirurgicoTouched;
    const gabaritoTouched = args.cadernoGabaritoTouched;

    await tx.$executeRaw`
      UPDATE cirurgias
         SET procedimento_principal_id = COALESCE(
               ${args.procedimentoPrincipalId}::bigint,
               procedimento_principal_id
             ),
             procedimentos_secundarios = CASE
               WHEN ${procSecTouched}::boolean THEN ${procSecJson}::jsonb
               ELSE procedimentos_secundarios
             END,
             sala_id = COALESCE(${args.salaId}::bigint, sala_id),
             data_hora_agendada = COALESCE(
               ${args.dataHoraAgendada}::timestamptz,
               data_hora_agendada
             ),
             duracao_estimada_minutos = COALESCE(
               ${args.duracaoEstimadaMinutos}::int,
               duracao_estimada_minutos
             ),
             cirurgiao_id = COALESCE(${args.cirurgiaoId}::bigint, cirurgiao_id),
             tipo_anestesia = CASE
               WHEN ${tipoAnesTouched}::boolean
                 THEN ${args.tipoAnestesia}::enum_cirurgia_tipo_anestesia
               ELSE tipo_anestesia
             END,
             classificacao_cirurgia = COALESCE(
               ${args.classificacaoCirurgia}::enum_cirurgia_classificacao,
               classificacao_cirurgia
             ),
             kit_cirurgico_id = CASE
               WHEN ${kitTouched}::boolean THEN ${args.kitCirurgicoId}::bigint
               ELSE kit_cirurgico_id
             END,
             caderno_gabarito_id = CASE
               WHEN ${gabaritoTouched}::boolean
                 THEN ${args.cadernoGabaritoId}::bigint
               ELSE caderno_gabarito_id
             END,
             updated_at = now()
       WHERE id = ${args.cirurgiaId}::bigint
    `;
  }

  /**
   * Empacota `procedimentos_secundarios` em `{ items, _meta }` para
   * permitir armazenar a flag `exigeAutorizacaoConvenio` (RN-CC-02) sem
   * adicionar coluna no schema P0.
   */
  private packProcSecundarios(args: {
    items: unknown;
    exigeAutorizacaoConvenio: boolean;
  }): string {
    const itemsArr = Array.isArray(args.items) ? args.items : [];
    return JSON.stringify({
      items: itemsArr,
      _meta: {
        exigeAutorizacaoConvenio: args.exigeAutorizacaoConvenio,
      },
    });
  }

  /**
   * Lê a estrutura atual de `procedimentos_secundarios` e devolve
   * `{ items, exigeAutorizacaoConvenio }`. Aceita formatos antigos
   * (array puro) por robustez.
   */
  unpackProcSecundarios(value: unknown): {
    items: unknown[];
    exigeAutorizacaoConvenio: boolean;
  } {
    if (value === null || value === undefined) {
      return { items: [], exigeAutorizacaoConvenio: false };
    }
    if (Array.isArray(value)) {
      return { items: value, exigeAutorizacaoConvenio: false };
    }
    if (typeof value === 'object') {
      const obj = value as {
        items?: unknown;
        _meta?: { exigeAutorizacaoConvenio?: unknown };
      };
      const items = Array.isArray(obj.items) ? obj.items : [];
      const flag =
        obj._meta?.exigeAutorizacaoConvenio === true ||
        obj._meta?.exigeAutorizacaoConvenio === 'true';
      return { items, exigeAutorizacaoConvenio: flag };
    }
    return { items: [], exigeAutorizacaoConvenio: false };
  }

  async updateOpme(args: {
    cirurgiaId: bigint;
    fase: 'solicitada' | 'autorizada' | 'utilizada';
    itens: unknown[];
    autorizadaPorUserId?: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const itensJson = JSON.stringify(args.itens);
    if (args.fase === 'solicitada') {
      await tx.$executeRaw`
        UPDATE cirurgias
           SET opme_solicitada = ${itensJson}::jsonb,
               updated_at      = now()
         WHERE id = ${args.cirurgiaId}::bigint
      `;
    } else if (args.fase === 'autorizada') {
      const autUser = args.autorizadaPorUserId ?? null;
      await tx.$executeRaw`
        UPDATE cirurgias
           SET opme_autorizada     = ${itensJson}::jsonb,
               opme_autorizacao_em = now(),
               opme_autorizacao_por = ${autUser}::bigint,
               updated_at          = now()
         WHERE id = ${args.cirurgiaId}::bigint
      `;
    } else {
      await tx.$executeRaw`
        UPDATE cirurgias
           SET opme_utilizada = ${itensJson}::jsonb,
               updated_at     = now()
         WHERE id = ${args.cirurgiaId}::bigint
      `;
    }
  }

  // ────────── Equipe ──────────

  async insertEquipe(args: {
    tenantId: bigint;
    cirurgiaId: bigint;
    prestadorId: bigint;
    funcao: string;
    ordem: number;
  }): Promise<{ id: bigint }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      INSERT INTO cirurgias_equipe (
        tenant_id, cirurgia_id, prestador_id, funcao, ordem
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.cirurgiaId}::bigint,
        ${args.prestadorId}::bigint,
        ${args.funcao},
        ${args.ordem}::int
      )
      RETURNING id
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cirurgias_equipe não retornou linha.');
    }
    return { id: rows[0].id };
  }

  async deleteEquipe(cirurgiaId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      DELETE FROM cirurgias_equipe
       WHERE cirurgia_id = ${cirurgiaId}::bigint
    `;
  }

  async setEquipeContaItem(args: {
    equipeId: bigint;
    contaItemId: bigint;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias_equipe
         SET conta_item_id = ${args.contaItemId}::bigint
       WHERE id = ${args.equipeId}::bigint
    `;
  }

  // ────────── Reads — cirurgia + equipe ──────────

  async findCirurgiaByUuid(uuid: string): Promise<CirurgiaRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<CirurgiaRow[]>`
      SELECT c.id,
             c.uuid_externo::text AS uuid_externo,
             c.tenant_id,
             c.atendimento_id,
             a.uuid_externo::text AS atendimento_uuid,
             c.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome_completo AS paciente_nome,
             c.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             c.procedimentos_secundarios,
             c.sala_id,
             sc.uuid_externo::text AS sala_uuid,
             sc.nome AS sala_nome,
             sc.setor_id,
             se.uuid_externo::text AS setor_uuid,
             c.data_hora_agendada,
             c.duracao_estimada_minutos,
             c.data_hora_inicio,
             c.data_hora_fim,
             c.cirurgiao_id,
             pr.uuid_externo::text AS cirurgiao_uuid,
             pr.nome_completo AS cirurgiao_nome,
             c.tipo_anestesia::text AS tipo_anestesia,
             c.classificacao_cirurgia::text AS classificacao_cirurgia,
             COALESCE(
               (c.procedimentos_secundarios->'_meta'->>'exigeAutorizacaoConvenio')::boolean,
               FALSE
             ) AS exige_autorizacao_convenio,
             c.kit_cirurgico_id,
             k.uuid_externo::text AS kit_cirurgico_uuid,
             c.caderno_gabarito_id,
             cg.uuid_externo::text AS caderno_gabarito_uuid,
             c.ficha_cirurgica,
             c.ficha_anestesica,
             c.intercorrencias,
             c.status::text AS status,
             c.conta_id,
             co.uuid_externo::text AS conta_uuid,
             c.opme_solicitada,
             c.opme_autorizada,
             c.opme_utilizada,
             c.cancelamento_motivo,
             c.cancelado_em
        FROM cirurgias c
        JOIN atendimentos a       ON a.id = c.atendimento_id
        JOIN pacientes pa         ON pa.id = c.paciente_id
        JOIN tabelas_procedimentos tp ON tp.id = c.procedimento_principal_id
        JOIN salas_cirurgicas sc  ON sc.id = c.sala_id
        LEFT JOIN setores se      ON se.id = sc.setor_id
        JOIN prestadores pr       ON pr.id = c.cirurgiao_id
        LEFT JOIN kits_cirurgicos k ON k.id = c.kit_cirurgico_id
        LEFT JOIN cadernos_gabaritos cg ON cg.id = c.caderno_gabarito_id
        LEFT JOIN contas co       ON co.id = c.conta_id
       WHERE c.uuid_externo = ${uuid}::uuid
         AND c.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findEquipeByCirurgiaId(cirurgiaId: bigint): Promise<EquipeRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EquipeRow[]>`
      SELECT ce.id,
             ce.cirurgia_id,
             ce.prestador_id,
             pr.uuid_externo::text AS prestador_uuid,
             pr.nome_completo AS prestador_nome,
             ce.funcao,
             ce.ordem,
             ce.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid
        FROM cirurgias_equipe ce
        JOIN prestadores pr      ON pr.id = ce.prestador_id
        LEFT JOIN contas_itens ci ON ci.id = ce.conta_item_id
                                AND ci.deleted_at IS NULL
       WHERE ce.cirurgia_id = ${cirurgiaId}::bigint
       ORDER BY ce.ordem ASC, ce.id ASC
    `;
    return rows;
  }

  async listCirurgias(args: {
    statuses?: CirurgiaStatus[];
    salaId?: bigint;
    cirurgiaoId?: bigint;
    pacienteId?: bigint;
    atendimentoId?: bigint;
    dataInicio?: string;
    dataFim?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CirurgiaRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const statusFilter = args.statuses ?? null;
    const salaFilter = args.salaId ?? null;
    const cirFilter = args.cirurgiaoId ?? null;
    const pacFilter = args.pacienteId ?? null;
    const atendFilter = args.atendimentoId ?? null;
    const inicioFilter = args.dataInicio ?? null;
    const fimFilter = args.dataFim ?? null;

    const rows = await tx.$queryRaw<CirurgiaRow[]>`
      SELECT c.id,
             c.uuid_externo::text AS uuid_externo,
             c.tenant_id,
             c.atendimento_id,
             a.uuid_externo::text AS atendimento_uuid,
             c.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome_completo AS paciente_nome,
             c.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             c.procedimentos_secundarios,
             c.sala_id,
             sc.uuid_externo::text AS sala_uuid,
             sc.nome AS sala_nome,
             sc.setor_id,
             se.uuid_externo::text AS setor_uuid,
             c.data_hora_agendada,
             c.duracao_estimada_minutos,
             c.data_hora_inicio,
             c.data_hora_fim,
             c.cirurgiao_id,
             pr.uuid_externo::text AS cirurgiao_uuid,
             pr.nome_completo AS cirurgiao_nome,
             c.tipo_anestesia::text AS tipo_anestesia,
             c.classificacao_cirurgia::text AS classificacao_cirurgia,
             COALESCE(
               (c.procedimentos_secundarios->'_meta'->>'exigeAutorizacaoConvenio')::boolean,
               FALSE
             ) AS exige_autorizacao_convenio,
             c.kit_cirurgico_id,
             k.uuid_externo::text AS kit_cirurgico_uuid,
             c.caderno_gabarito_id,
             cg.uuid_externo::text AS caderno_gabarito_uuid,
             c.ficha_cirurgica,
             c.ficha_anestesica,
             c.intercorrencias,
             c.status::text AS status,
             c.conta_id,
             co.uuid_externo::text AS conta_uuid,
             c.opme_solicitada,
             c.opme_autorizada,
             c.opme_utilizada,
             c.cancelamento_motivo,
             c.cancelado_em
        FROM cirurgias c
        JOIN atendimentos a       ON a.id = c.atendimento_id
        JOIN pacientes pa         ON pa.id = c.paciente_id
        JOIN tabelas_procedimentos tp ON tp.id = c.procedimento_principal_id
        JOIN salas_cirurgicas sc  ON sc.id = c.sala_id
        LEFT JOIN setores se      ON se.id = sc.setor_id
        JOIN prestadores pr       ON pr.id = c.cirurgiao_id
        LEFT JOIN kits_cirurgicos k ON k.id = c.kit_cirurgico_id
        LEFT JOIN cadernos_gabaritos cg ON cg.id = c.caderno_gabarito_id
        LEFT JOIN contas co       ON co.id = c.conta_id
       WHERE c.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR c.status::text = ANY(${statusFilter}::text[]))
         AND (${salaFilter}::bigint  IS NULL OR c.sala_id      = ${salaFilter}::bigint)
         AND (${cirFilter}::bigint   IS NULL OR c.cirurgiao_id = ${cirFilter}::bigint)
         AND (${pacFilter}::bigint   IS NULL OR c.paciente_id  = ${pacFilter}::bigint)
         AND (${atendFilter}::bigint IS NULL OR c.atendimento_id = ${atendFilter}::bigint)
         AND (${inicioFilter}::timestamptz IS NULL
              OR c.data_hora_agendada >= ${inicioFilter}::timestamptz)
         AND (${fimFilter}::timestamptz IS NULL
              OR c.data_hora_agendada < ${fimFilter}::timestamptz)
       ORDER BY c.data_hora_agendada DESC, c.id DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;

    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM cirurgias c
       WHERE c.deleted_at IS NULL
         AND (${statusFilter}::text[] IS NULL
              OR c.status::text = ANY(${statusFilter}::text[]))
         AND (${salaFilter}::bigint  IS NULL OR c.sala_id      = ${salaFilter}::bigint)
         AND (${cirFilter}::bigint   IS NULL OR c.cirurgiao_id = ${cirFilter}::bigint)
         AND (${pacFilter}::bigint   IS NULL OR c.paciente_id  = ${pacFilter}::bigint)
         AND (${atendFilter}::bigint IS NULL OR c.atendimento_id = ${atendFilter}::bigint)
         AND (${inicioFilter}::timestamptz IS NULL
              OR c.data_hora_agendada >= ${inicioFilter}::timestamptz)
         AND (${fimFilter}::timestamptz IS NULL
              OR c.data_hora_agendada < ${fimFilter}::timestamptz)
    `;
    const total =
      totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async listEquipesByCirurgiaIds(
    cirurgiaIds: bigint[],
  ): Promise<Map<bigint, EquipeRow[]>> {
    const out = new Map<bigint, EquipeRow[]>();
    if (cirurgiaIds.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<EquipeRow[]>`
      SELECT ce.id,
             ce.cirurgia_id,
             ce.prestador_id,
             pr.uuid_externo::text AS prestador_uuid,
             pr.nome_completo AS prestador_nome,
             ce.funcao,
             ce.ordem,
             ce.conta_item_id,
             ci.uuid_externo::text AS conta_item_uuid
        FROM cirurgias_equipe ce
        JOIN prestadores pr      ON pr.id = ce.prestador_id
        LEFT JOIN contas_itens ci ON ci.id = ce.conta_item_id
                                AND ci.deleted_at IS NULL
       WHERE ce.cirurgia_id = ANY(${cirurgiaIds}::bigint[])
       ORDER BY ce.cirurgia_id ASC, ce.ordem ASC, ce.id ASC
    `;
    for (const r of rows) {
      const list = out.get(r.cirurgia_id) ?? [];
      list.push(r);
      out.set(r.cirurgia_id, list);
    }
    return out;
  }

  // ────────── Mapa de salas ──────────

  async listMapaSalas(args: {
    dataInicio: string;
    dataFim: string;
  }): Promise<{
    salas: Array<{
      sala_id: bigint;
      sala_uuid: string;
      sala_nome: string;
      setor: string | null;
    }>;
    cirurgias: CirurgiaRow[];
  }> {
    const tx = this.prisma.tx();
    const salas = await tx.$queryRaw<
      Array<{
        sala_id: bigint;
        sala_uuid: string;
        sala_nome: string;
        setor: string | null;
      }>
    >`
      SELECT sc.id              AS sala_id,
             sc.uuid_externo::text AS sala_uuid,
             sc.nome            AS sala_nome,
             se.nome            AS setor
        FROM salas_cirurgicas sc
        LEFT JOIN setores se ON se.id = sc.setor_id
       WHERE sc.deleted_at IS NULL
         AND sc.ativa = TRUE
       ORDER BY sc.nome ASC
    `;
    const cirurgias = await tx.$queryRaw<CirurgiaRow[]>`
      SELECT c.id,
             c.uuid_externo::text AS uuid_externo,
             c.tenant_id,
             c.atendimento_id,
             a.uuid_externo::text AS atendimento_uuid,
             c.paciente_id,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome_completo AS paciente_nome,
             c.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             c.procedimentos_secundarios,
             c.sala_id,
             sc.uuid_externo::text AS sala_uuid,
             sc.nome AS sala_nome,
             sc.setor_id,
             se.uuid_externo::text AS setor_uuid,
             c.data_hora_agendada,
             c.duracao_estimada_minutos,
             c.data_hora_inicio,
             c.data_hora_fim,
             c.cirurgiao_id,
             pr.uuid_externo::text AS cirurgiao_uuid,
             pr.nome_completo AS cirurgiao_nome,
             c.tipo_anestesia::text AS tipo_anestesia,
             c.classificacao_cirurgia::text AS classificacao_cirurgia,
             COALESCE(
               (c.procedimentos_secundarios->'_meta'->>'exigeAutorizacaoConvenio')::boolean,
               FALSE
             ) AS exige_autorizacao_convenio,
             c.kit_cirurgico_id,
             k.uuid_externo::text AS kit_cirurgico_uuid,
             c.caderno_gabarito_id,
             cg.uuid_externo::text AS caderno_gabarito_uuid,
             c.ficha_cirurgica,
             c.ficha_anestesica,
             c.intercorrencias,
             c.status::text AS status,
             c.conta_id,
             co.uuid_externo::text AS conta_uuid,
             c.opme_solicitada,
             c.opme_autorizada,
             c.opme_utilizada,
             c.cancelamento_motivo,
             c.cancelado_em
        FROM cirurgias c
        JOIN atendimentos a       ON a.id = c.atendimento_id
        JOIN pacientes pa         ON pa.id = c.paciente_id
        JOIN tabelas_procedimentos tp ON tp.id = c.procedimento_principal_id
        JOIN salas_cirurgicas sc  ON sc.id = c.sala_id
        LEFT JOIN setores se      ON se.id = sc.setor_id
        JOIN prestadores pr       ON pr.id = c.cirurgiao_id
        LEFT JOIN kits_cirurgicos k ON k.id = c.kit_cirurgico_id
        LEFT JOIN cadernos_gabaritos cg ON cg.id = c.caderno_gabarito_id
        LEFT JOIN contas co       ON co.id = c.conta_id
       WHERE c.deleted_at IS NULL
         AND c.data_hora_agendada >= ${args.dataInicio}::timestamptz
         AND c.data_hora_agendada <  ${args.dataFim}::timestamptz
       ORDER BY c.sala_id ASC, c.data_hora_agendada ASC
    `;
    return { salas, cirurgias };
  }

  // ────────── Kits ──────────

  async insertKit(args: {
    tenantId: bigint;
    codigo: string;
    nome: string;
    descricao: string | null;
    ativo: boolean;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO kits_cirurgicos (
        tenant_id, codigo, nome, descricao, ativo, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.codigo},
        ${args.nome},
        ${args.descricao},
        ${args.ativo}::boolean,
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT kits_cirurgicos não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async insertKitItem(args: {
    tenantId: bigint;
    kitId: bigint;
    procedimentoId: bigint;
    quantidade: number;
    obrigatorio: boolean;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      INSERT INTO kits_cirurgicos_itens (
        tenant_id, kit_id, procedimento_id, quantidade, obrigatorio
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.kitId}::bigint,
        ${args.procedimentoId}::bigint,
        ${args.quantidade}::numeric,
        ${args.obrigatorio}::boolean
      )
    `;
  }

  async deleteKitItens(kitId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      DELETE FROM kits_cirurgicos_itens
       WHERE kit_id = ${kitId}::bigint
    `;
  }

  async updateKit(args: {
    kitId: bigint;
    nome?: string;
    descricao?: string | null;
    descricaoTouched: boolean;
    ativo?: boolean;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const descTouched = args.descricaoTouched;
    await tx.$executeRaw`
      UPDATE kits_cirurgicos
         SET nome      = COALESCE(${args.nome}, nome),
             descricao = CASE
               WHEN ${descTouched}::boolean THEN ${args.descricao}::text
               ELSE descricao
             END,
             ativo     = COALESCE(${args.ativo}::boolean, ativo),
             updated_at = now()
       WHERE id = ${args.kitId}::bigint
    `;
  }

  async softDeleteKit(kitId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE kits_cirurgicos
         SET deleted_at = now(),
             ativo      = FALSE,
             updated_at = now()
       WHERE id = ${kitId}::bigint
         AND deleted_at IS NULL
    `;
    // Audit "S" gravado pelo use case com userId no contexto.
  }

  async findKitByUuid(uuid: string): Promise<KitRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<KitRow[]>`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             tenant_id,
             codigo, nome, descricao, ativo
        FROM kits_cirurgicos
       WHERE uuid_externo = ${uuid}::uuid
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findKitItensByKitId(kitId: bigint): Promise<KitItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<KitItemRow[]>`
      SELECT ki.id,
             ki.kit_id,
             ki.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             ki.quantidade::text AS quantidade,
             ki.obrigatorio
        FROM kits_cirurgicos_itens ki
        JOIN tabelas_procedimentos tp ON tp.id = ki.procedimento_id
       WHERE ki.kit_id = ${kitId}::bigint
       ORDER BY ki.id ASC
    `;
    return rows;
  }

  async listKits(args: {
    ativo?: boolean;
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<{ rows: KitRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const ativoFilter = args.ativo ?? null;
    const searchFilter = args.search ?? null;

    const rows = await tx.$queryRaw<KitRow[]>`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             tenant_id,
             codigo, nome, descricao, ativo
        FROM kits_cirurgicos
       WHERE deleted_at IS NULL
         AND (${ativoFilter}::boolean IS NULL OR ativo = ${ativoFilter}::boolean)
         AND (${searchFilter}::text IS NULL
              OR codigo ILIKE '%' || ${searchFilter}::text || '%'
              OR nome   ILIKE '%' || ${searchFilter}::text || '%')
       ORDER BY codigo ASC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM kits_cirurgicos
       WHERE deleted_at IS NULL
         AND (${ativoFilter}::boolean IS NULL OR ativo = ${ativoFilter}::boolean)
         AND (${searchFilter}::text IS NULL
              OR codigo ILIKE '%' || ${searchFilter}::text || '%'
              OR nome   ILIKE '%' || ${searchFilter}::text || '%')
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  async listKitItensForKitIds(
    kitIds: bigint[],
  ): Promise<Map<bigint, KitItemRow[]>> {
    const out = new Map<bigint, KitItemRow[]>();
    if (kitIds.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<KitItemRow[]>`
      SELECT ki.id,
             ki.kit_id,
             ki.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             ki.quantidade::text AS quantidade,
             ki.obrigatorio
        FROM kits_cirurgicos_itens ki
        JOIN tabelas_procedimentos tp ON tp.id = ki.procedimento_id
       WHERE ki.kit_id = ANY(${kitIds}::bigint[])
       ORDER BY ki.kit_id ASC, ki.id ASC
    `;
    for (const r of rows) {
      const list = out.get(r.kit_id) ?? [];
      list.push(r);
      out.set(r.kit_id, list);
    }
    return out;
  }

  // ────────── Gabaritos ──────────

  async insertGabarito(args: {
    tenantId: bigint;
    procedimentoPrincipalId: bigint;
    cirurgiaoId: bigint | null;
    versao: number;
    ativo: boolean;
    observacao: string | null;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO cadernos_gabaritos (
        tenant_id, procedimento_principal_id, cirurgiao_id,
        versao, ativo, observacao, created_by
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.procedimentoPrincipalId}::bigint,
        ${args.cirurgiaoId}::bigint,
        ${args.versao}::int,
        ${args.ativo}::boolean,
        ${args.observacao},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT cadernos_gabaritos não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async insertGabaritoItem(args: {
    tenantId: bigint;
    cadernoId: bigint;
    procedimentoId: bigint;
    quantidadePadrao: number;
    obrigatorio: boolean;
    observacao: string | null;
  }): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      INSERT INTO cadernos_gabaritos_itens (
        tenant_id, caderno_id, procedimento_id,
        quantidade_padrao, obrigatorio, observacao
      ) VALUES (
        ${args.tenantId}::bigint,
        ${args.cadernoId}::bigint,
        ${args.procedimentoId}::bigint,
        ${args.quantidadePadrao}::numeric,
        ${args.obrigatorio}::boolean,
        ${args.observacao}
      )
    `;
  }

  async deleteGabaritoItens(cadernoId: bigint): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      DELETE FROM cadernos_gabaritos_itens
       WHERE caderno_id = ${cadernoId}::bigint
    `;
  }

  async updateGabarito(args: {
    cadernoId: bigint;
    ativo?: boolean;
    observacao?: string | null;
    observacaoTouched: boolean;
  }): Promise<void> {
    const tx = this.prisma.tx();
    const obsTouched = args.observacaoTouched;
    await tx.$executeRaw`
      UPDATE cadernos_gabaritos
         SET ativo = COALESCE(${args.ativo}::boolean, ativo),
             observacao = CASE
               WHEN ${obsTouched}::boolean THEN ${args.observacao}::text
               ELSE observacao
             END,
             updated_at = now()
       WHERE id = ${args.cadernoId}::bigint
    `;
  }

  async findGabaritoByUuid(uuid: string): Promise<GabaritoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GabaritoRow[]>`
      SELECT cg.id,
             cg.uuid_externo::text AS uuid_externo,
             cg.tenant_id,
             cg.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome              AS procedimento_principal_nome,
             cg.cirurgiao_id,
             pr.uuid_externo::text AS cirurgiao_uuid,
             pr.nome_completo     AS cirurgiao_nome,
             cg.versao, cg.ativo, cg.observacao
        FROM cadernos_gabaritos cg
        JOIN tabelas_procedimentos tp ON tp.id = cg.procedimento_principal_id
        LEFT JOIN prestadores pr ON pr.id = cg.cirurgiao_id
       WHERE cg.uuid_externo = ${uuid}::uuid
         AND cg.deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findGabaritoItensByCadernoId(
    cadernoId: bigint,
  ): Promise<GabaritoItemRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<GabaritoItemRow[]>`
      SELECT cgi.id,
             cgi.caderno_id,
             cgi.procedimento_id,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome AS procedimento_nome,
             tp.grupo_gasto::text AS procedimento_grupo_gasto,
             cgi.quantidade_padrao::text AS quantidade_padrao,
             cgi.obrigatorio,
             cgi.observacao
        FROM cadernos_gabaritos_itens cgi
        JOIN tabelas_procedimentos tp ON tp.id = cgi.procedimento_id
       WHERE cgi.caderno_id = ${cadernoId}::bigint
       ORDER BY cgi.id ASC
    `;
    return rows;
  }

  async listGabaritos(args: {
    procedimentoPrincipalId?: bigint;
    cirurgiaoId?: bigint;
    ativo?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ rows: GabaritoRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const procFilter = args.procedimentoPrincipalId ?? null;
    const cirFilter = args.cirurgiaoId ?? null;
    const ativoFilter = args.ativo ?? null;

    const rows = await tx.$queryRaw<GabaritoRow[]>`
      SELECT cg.id,
             cg.uuid_externo::text AS uuid_externo,
             cg.tenant_id,
             cg.procedimento_principal_id,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome AS procedimento_principal_nome,
             cg.cirurgiao_id,
             pr.uuid_externo::text AS cirurgiao_uuid,
             pr.nome_completo     AS cirurgiao_nome,
             cg.versao, cg.ativo, cg.observacao
        FROM cadernos_gabaritos cg
        JOIN tabelas_procedimentos tp ON tp.id = cg.procedimento_principal_id
        LEFT JOIN prestadores pr ON pr.id = cg.cirurgiao_id
       WHERE cg.deleted_at IS NULL
         AND (${procFilter}::bigint IS NULL
              OR cg.procedimento_principal_id = ${procFilter}::bigint)
         AND (${cirFilter}::bigint IS NULL
              OR cg.cirurgiao_id = ${cirFilter}::bigint)
         AND (${ativoFilter}::boolean IS NULL OR cg.ativo = ${ativoFilter}::boolean)
       ORDER BY cg.procedimento_principal_id ASC, cg.versao DESC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM cadernos_gabaritos cg
       WHERE cg.deleted_at IS NULL
         AND (${procFilter}::bigint IS NULL
              OR cg.procedimento_principal_id = ${procFilter}::bigint)
         AND (${cirFilter}::bigint IS NULL
              OR cg.cirurgiao_id = ${cirFilter}::bigint)
         AND (${ativoFilter}::boolean IS NULL OR cg.ativo = ${ativoFilter}::boolean)
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  // ────────── contas_itens ──────────

  async insertContaItem(args: {
    tenantId: bigint;
    contaId: bigint;
    procedimentoId: bigint;
    grupoGasto: string;
    origem: string;
    origemReferenciaId: bigint;
    origemReferenciaTipo: string;
    quantidade: string;
    setorId: bigint | null;
    prestadorExecutanteId: bigint | null;
    dataRealizacao: string | null;
    lote: string | null;
    fabricante: string | null;
    registroAnvisa: string | null;
    userId: bigint;
  }): Promise<{ id: bigint; uuidExterno: string }> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { id: bigint; uuid_externo: string }[]
    >`
      INSERT INTO contas_itens (
        tenant_id, conta_id, procedimento_id, grupo_gasto,
        origem, origem_referencia_id, origem_referencia_tipo,
        quantidade, setor_id, prestador_executante_id,
        data_realizacao, lote, fabricante, registro_anvisa,
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
        ${args.setorId}::bigint,
        ${args.prestadorExecutanteId}::bigint,
        ${args.dataRealizacao}::timestamptz,
        ${args.lote},
        ${args.fabricante},
        ${args.registroAnvisa},
        ${args.userId}::bigint
      )
      RETURNING id, uuid_externo::text AS uuid_externo
    `;
    if (rows.length === 0) {
      throw new Error('INSERT contas_itens não retornou linha.');
    }
    return { id: rows[0].id, uuidExterno: rows[0].uuid_externo };
  }

  async setCirurgiaContaId(
    cirurgiaId: bigint,
    contaId: bigint,
  ): Promise<void> {
    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE cirurgias
         SET conta_id = ${contaId}::bigint,
             updated_at = now()
       WHERE id = ${cirurgiaId}::bigint
    `;
  }
}
