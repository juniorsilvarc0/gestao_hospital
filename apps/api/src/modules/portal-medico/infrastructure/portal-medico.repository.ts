/**
 * `PortalMedicoRepository` — queries específicas do Portal do Médico.
 *
 * Decisões (registradas no relatório da trilha):
 *   - `AgendamentoRepository`, `CentroCirurgicoRepository` e
 *     `RepasseRepository` SÃO importados via os módulos respectivos
 *     (todos exportam o repo). NÃO duplicamos lógica deles.
 *   - `ExamesRepository` NÃO é exportado pelo `ExamesModule`, então as
 *     consultas de "laudos pendentes" são feitas aqui via `tx().$queryRaw`
 *     diretamente em `resultados_exame`.
 *   - Lookups específicos do portal (resolver `prestador_id` a partir do
 *     `usuario_id`, dados completos do prestador, agregados por
 *     `grupo_gasto`/`funcao` na competência) também moram aqui.
 *
 * Todas as queries usam `prisma.tx()` — o `TenantContextInterceptor`
 * já fez `SET LOCAL app.current_tenant_id`, então RLS é aplicado.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface UsuarioMedicoRow {
  id: bigint;
  prestador_id: bigint | null;
  tipo_perfil: string;
  ativo: boolean;
  deleted_at: Date | null;
}

export interface PrestadorRow {
  id: bigint;
  uuid_externo: string;
  nome: string;
  tipo_conselho: string | null;
  numero_conselho: string | null;
  uf_conselho: string | null;
  rqe: string | null;
  cbo_principal: string | null;
  tipo_vinculo: string | null;
  recebe_repasse: boolean;
  ativo: boolean;
}

export interface LaudoPendenteRow {
  resultado_uuid: string;
  solicitacao_uuid: string;
  paciente_uuid: string;
  paciente_nome: string | null;
  procedimento_uuid: string;
  procedimento_nome: string | null;
  procedimento_codigo: string | null;
  status: string;
  data_coleta: Date | null;
  data_processamento: Date | null;
  created_at: Date;
}

export interface AgregadoTipoRow {
  tipo: string;
  qtd: number;
  valor: string;
}

export interface AgregadoFuncaoRow {
  funcao: string;
  qtd: number;
  valor: string;
}

export interface ProducaoTotaisRow {
  total_atendimentos: number;
  total_cirurgias: number;
  total_laudos: number;
}

export interface ProximaConsultaRow {
  agendamento_uuid: string;
  inicio: Date;
  paciente_uuid: string;
  paciente_nome: string;
  recurso_uuid: string;
  tipo: string;
  link_teleconsulta: string | null;
}

@Injectable()
export class PortalMedicoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Carrega o usuário com o `prestador_id` vinculado. Usado pelo
   * `MedicoOnlyGuard` e pelos use cases.
   */
  async findUsuarioMedicoById(
    usuarioId: bigint,
  ): Promise<UsuarioMedicoRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<UsuarioMedicoRow[]>`
      SELECT id,
             prestador_id,
             tipo_perfil::text AS tipo_perfil,
             ativo,
             deleted_at
        FROM usuarios
       WHERE id = ${usuarioId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  async findPrestadorById(prestadorId: bigint): Promise<PrestadorRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<PrestadorRow[]>`
      SELECT id,
             uuid_externo::text AS uuid_externo,
             nome,
             tipo_conselho::text AS tipo_conselho,
             numero_conselho,
             uf_conselho,
             rqe,
             cbo_principal,
             tipo_vinculo::text AS tipo_vinculo,
             recebe_repasse,
             ativo
        FROM prestadores
       WHERE id = ${prestadorId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Lista permissões efetivas do usuário (perfis ativos × permissões),
   * filtradas por tenant via RLS.
   */
  async findPermissoesByUsuarioId(usuarioId: bigint): Promise<string[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ recurso: string; acao: string }[]>`
      SELECT DISTINCT perm.recurso, perm.acao
        FROM usuarios_perfis up
        JOIN perfis pf            ON pf.id = up.perfil_id AND pf.ativo = TRUE
        JOIN perfis_permissoes pp ON pp.perfil_id = pf.id
        JOIN permissoes perm      ON perm.id = pp.permissao_id
       WHERE up.usuario_id = ${usuarioId}::bigint
       ORDER BY perm.recurso, perm.acao
    `;
    return rows.map((r) => `${r.recurso}:${r.acao}`);
  }

  /**
   * Conta laudos pendentes para o médico (laudista). Critério:
   *   - `resultados_exame.assinado_em IS NULL`
   *   - `resultados_exame.laudista_id = prestadorId` OU
   *     (`laudista_id IS NULL` AND solicitacao.solicitante_id = prestadorId)
   *   - status diferente de CANCELADO.
   *
   * A leitura "laudos a laudar" (do enunciado) cobre as duas perspectivas:
   * laudos já atribuídos ao médico (laudista) e laudos não atribuídos de
   * exames que ele mesmo solicitou e ainda esperam laudo.
   */
  async countLaudosPendentes(prestadorId: bigint): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM resultados_exame r
        JOIN solicitacoes_exame_itens si ON si.id = r.solicitacao_item_id
        JOIN solicitacoes_exame s        ON s.id  = si.solicitacao_id
       WHERE r.assinado_em IS NULL
         AND r.status::text NOT IN ('CANCELADO', 'LAUDO_FINAL')
         AND (
              r.laudista_id = ${prestadorId}::bigint
              OR (r.laudista_id IS NULL AND s.solicitante_id = ${prestadorId}::bigint)
         )
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  async findLaudosPendentes(args: {
    prestadorId: bigint;
    page: number;
    pageSize: number;
  }): Promise<{ rows: LaudoPendenteRow[]; total: number }> {
    const tx = this.prisma.tx();
    const offset = (args.page - 1) * args.pageSize;
    const rows = await tx.$queryRaw<LaudoPendenteRow[]>`
      SELECT r.uuid_externo::text  AS resultado_uuid,
             s.uuid_externo::text  AS solicitacao_uuid,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome               AS paciente_nome,
             tp.uuid_externo::text AS procedimento_uuid,
             tp.nome               AS procedimento_nome,
             tp.codigo_tuss        AS procedimento_codigo,
             r.status::text        AS status,
             r.data_coleta,
             r.data_processamento,
             r.created_at
        FROM resultados_exame r
        JOIN solicitacoes_exame_itens si ON si.id = r.solicitacao_item_id
        JOIN solicitacoes_exame s        ON s.id  = si.solicitacao_id
        JOIN pacientes pa                ON pa.id = r.paciente_id
        JOIN tabelas_procedimentos tp    ON tp.id = si.procedimento_id
       WHERE r.assinado_em IS NULL
         AND r.status::text NOT IN ('CANCELADO', 'LAUDO_FINAL')
         AND (
              r.laudista_id = ${args.prestadorId}::bigint
              OR (r.laudista_id IS NULL AND s.solicitante_id = ${args.prestadorId}::bigint)
         )
       ORDER BY COALESCE(r.data_coleta, r.created_at) ASC, r.id ASC
       LIMIT ${args.pageSize}::int OFFSET ${offset}::int
    `;
    const totalRows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM resultados_exame r
        JOIN solicitacoes_exame_itens si ON si.id = r.solicitacao_item_id
        JOIN solicitacoes_exame s        ON s.id  = si.solicitacao_id
       WHERE r.assinado_em IS NULL
         AND r.status::text NOT IN ('CANCELADO', 'LAUDO_FINAL')
         AND (
              r.laudista_id = ${args.prestadorId}::bigint
              OR (r.laudista_id IS NULL AND s.solicitante_id = ${args.prestadorId}::bigint)
         )
    `;
    const total = totalRows.length === 0 ? 0 : Number(totalRows[0].total);
    return { rows, total };
  }

  /**
   * Resolve o `recurso_id` do agendamento a partir do prestador.
   * Apenas recursos do tipo PRESTADOR ativos são considerados.
   */
  async findRecursoIdsByPrestador(prestadorId: bigint): Promise<bigint[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM agendas_recursos
       WHERE prestador_id = ${prestadorId}::bigint
         AND deleted_at IS NULL
    `;
    return rows.map((r) => r.id);
  }

  /**
   * Conta agendamentos (não cancelados/reagendados) do prestador no
   * intervalo. Considera todos os recursos do tipo PRESTADOR vinculados
   * a ele.
   */
  async countAgendamentosRange(args: {
    prestadorId: bigint;
    inicio: string;
    fim: string;
  }): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM agendamentos a
        JOIN agendas_recursos ar ON ar.id = a.recurso_id
       WHERE ar.prestador_id = ${args.prestadorId}::bigint
         AND a.status NOT IN ('CANCELADO','REAGENDADO')
         AND a.inicio < ${args.fim}::timestamptz
         AND a.fim    > ${args.inicio}::timestamptz
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  /**
   * Conta cirurgias do médico (cirurgião OU equipe) no intervalo.
   * Apenas status que ainda ocupam o cronograma (não CANCELADA).
   */
  async countCirurgiasRange(args: {
    prestadorId: bigint;
    inicio: string;
    fim: string;
  }): Promise<number> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(DISTINCT c.id)::bigint AS total
        FROM cirurgias c
        LEFT JOIN cirurgias_equipe ce ON ce.cirurgia_id = c.id
       WHERE c.deleted_at IS NULL
         AND c.status::text <> 'CANCELADA'
         AND c.data_hora_agendada >= ${args.inicio}::timestamptz
         AND c.data_hora_agendada <  ${args.fim}::timestamptz
         AND (
              c.cirurgiao_id = ${args.prestadorId}::bigint
              OR ce.prestador_id = ${args.prestadorId}::bigint
         )
    `;
    return rows.length === 0 ? 0 : Number(rows[0].total);
  }

  /**
   * Próxima consulta agendada para o médico — primeiro AGENDADO/CONFIRMADO
   * com `inicio >= now()`. Retorna `null` se nenhuma futura.
   */
  async findProximaConsulta(
    prestadorId: bigint,
    now: string,
  ): Promise<ProximaConsultaRow | null> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<ProximaConsultaRow[]>`
      SELECT a.uuid_externo::text  AS agendamento_uuid,
             a.inicio,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome               AS paciente_nome,
             ar.uuid_externo::text AS recurso_uuid,
             a.tipo::text          AS tipo,
             a.link_teleconsulta
        FROM agendamentos a
        JOIN pacientes        pa ON pa.id = a.paciente_id
        JOIN agendas_recursos ar ON ar.id = a.recurso_id
       WHERE ar.prestador_id = ${prestadorId}::bigint
         AND a.status NOT IN ('CANCELADO','REAGENDADO','COMPARECEU','FALTOU')
         AND a.inicio >= ${now}::timestamptz
       ORDER BY a.inicio ASC
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Totais brutos de produção do médico na competência:
   *   - `total_atendimentos`: itens executados pelo prestador como
   *     `prestador_executante_id` em contas faturadas na competência.
   *   - `total_cirurgias`: cirurgias finalizadas onde ele é cirurgião OU
   *     membro da equipe.
   *   - `total_laudos`: resultados de exame assinados por ele na
   *     competência (laudista_id = prestadorId).
   *
   * Competência é casada por `data_realizacao`/`data_hora_fim`/
   * `data_laudo` no mês — útil para comparação rápida no dashboard.
   */
  async findProducaoTotais(args: {
    prestadorId: bigint;
    competencia: string;
  }): Promise<ProducaoTotaisRow> {
    const tx = this.prisma.tx();
    const compStart = `${args.competencia}-01`;
    const rows = await tx.$queryRaw<ProducaoTotaisRow[]>`
      WITH faixa AS (
        SELECT ${compStart}::date AS dt_ini,
               (date_trunc('month', ${compStart}::date) + interval '1 month - 1 day')::date AS dt_fim
      )
      SELECT
        (SELECT COUNT(DISTINCT ci.id)::int
           FROM contas_itens ci, faixa f
          WHERE ci.deleted_at IS NULL
            AND ci.prestador_executante_id = ${args.prestadorId}::bigint
            AND ci.data_realizacao IS NOT NULL
            AND ci.data_realizacao::date BETWEEN f.dt_ini AND f.dt_fim
        ) AS total_atendimentos,
        (SELECT COUNT(DISTINCT c.id)::int
           FROM cirurgias c, faixa f
           LEFT JOIN cirurgias_equipe ce ON ce.cirurgia_id = c.id
          WHERE c.deleted_at IS NULL
            AND c.data_hora_fim IS NOT NULL
            AND c.data_hora_fim::date BETWEEN f.dt_ini AND f.dt_fim
            AND (c.cirurgiao_id = ${args.prestadorId}::bigint
                 OR ce.prestador_id = ${args.prestadorId}::bigint)
        ) AS total_cirurgias,
        (SELECT COUNT(*)::int
           FROM resultados_exame r, faixa f
          WHERE r.laudista_id = ${args.prestadorId}::bigint
            AND r.assinado_em IS NOT NULL
            AND r.assinado_em::date BETWEEN f.dt_ini AND f.dt_fim
        ) AS total_laudos
    `;
    if (rows.length === 0) {
      return { total_atendimentos: 0, total_cirurgias: 0, total_laudos: 0 };
    }
    return {
      total_atendimentos: Number(rows[0].total_atendimentos ?? 0),
      total_cirurgias: Number(rows[0].total_cirurgias ?? 0),
      total_laudos: Number(rows[0].total_laudos ?? 0),
    };
  }

  /**
   * Agregado por `grupo_gasto` (qtd + valor) das contas_itens executadas
   * pelo prestador em contas faturadas na competência. Considera apenas
   * itens com `prestador_executante_id = prestadorId` (não inclui itens
   * de equipe que vão em `cirurgias_equipe`).
   */
  async findProducaoPorTipo(args: {
    prestadorId: bigint;
    competencia: string;
  }): Promise<AgregadoTipoRow[]> {
    const tx = this.prisma.tx();
    const compStart = `${args.competencia}-01`;
    const rows = await tx.$queryRaw<AgregadoTipoRow[]>`
      WITH faixa AS (
        SELECT ${compStart}::date AS dt_ini,
               (date_trunc('month', ${compStart}::date) + interval '1 month - 1 day')::date AS dt_fim
      )
      SELECT ci.grupo_gasto::text AS tipo,
             COUNT(*)::int                              AS qtd,
             COALESCE(SUM(ci.valor_total), 0)::text     AS valor
        FROM contas_itens ci, faixa f
        JOIN contas c ON c.id = ci.conta_id
       WHERE ci.deleted_at IS NULL
         AND ci.prestador_executante_id = ${args.prestadorId}::bigint
         AND c.deleted_at IS NULL
         AND ci.data_realizacao IS NOT NULL
         AND ci.data_realizacao::date BETWEEN f.dt_ini AND f.dt_fim
       GROUP BY ci.grupo_gasto
       ORDER BY ci.grupo_gasto ASC
    `;
    return rows.map((r) => ({
      tipo: r.tipo,
      qtd: Number(r.qtd),
      valor: r.valor,
    }));
  }

  /**
   * Agregado por `funcao` em `repasses_itens` da competência. Quando há
   * repasse apurado, esta é a leitura mais fiel da produção — já carrega
   * a função (cirurgião / 1º auxiliar / instrumentador / executante).
   */
  async findProducaoPorFuncao(args: {
    prestadorId: bigint;
    competencia: string;
  }): Promise<AgregadoFuncaoRow[]> {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<AgregadoFuncaoRow[]>`
      SELECT COALESCE(ri.funcao, '—')                  AS funcao,
             COUNT(*)::int                              AS qtd,
             COALESCE(SUM(ri.valor_calculado), 0)::text AS valor
        FROM repasses_itens ri
        JOIN repasses r ON r.id = ri.repasse_id
       WHERE r.prestador_id = ${args.prestadorId}::bigint
         AND r.competencia  = ${args.competencia}
         AND r.status::text <> 'CANCELADO'
         AND ri.glosado     = FALSE
       GROUP BY ri.funcao
       ORDER BY funcao ASC
    `;
    return rows.map((r) => ({
      funcao: r.funcao,
      qtd: Number(r.qtd),
      valor: r.valor,
    }));
  }

  /**
   * Bulk lookup: retorna `Map<paciente_uuid, nome>` para os UUIDs dados.
   * Usado para enriquecer respostas do agendamento sem exigir join
   * adicional no repositório original.
   */
  async findPacientesNomesByUuids(
    uuids: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (uuids.length === 0) return out;
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      { uuid_externo: string; nome: string }[]
    >`
      SELECT uuid_externo::text AS uuid_externo, nome
        FROM pacientes
       WHERE uuid_externo = ANY(${uuids}::uuid[])
         AND deleted_at IS NULL
    `;
    for (const r of rows) out.set(r.uuid_externo, r.nome);
    return out;
  }

  /**
   * IDs de cirurgias onde o prestador participou (cirurgião OU equipe)
   * dentro do range. Usado para listar e enriquecer com dados completos.
   *
   * Trazemos só o necessário para a tela do portal — papel, função e os
   * campos do "card" da cirurgia. Não reutilizamos `listCirurgias` do
   * `CentroCirurgicoRepository` porque ele exige filtro por
   * `cirurgiaoId` e não contempla "ou está na equipe".
   */
  async findCirurgiasDoMedico(args: {
    prestadorId: bigint;
    inicio: string;
    fim: string;
  }): Promise<
    Array<{
      id: bigint;
      uuid_externo: string;
      data_hora_agendada: Date;
      duracao_estimada_minutos: number | null;
      paciente_uuid: string;
      paciente_nome: string | null;
      procedimento_principal_uuid: string;
      procedimento_principal_nome: string | null;
      sala_uuid: string;
      sala_nome: string;
      status: string;
      papel: 'CIRURGIAO' | 'EQUIPE';
      funcao: string | null;
    }>
  > {
    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      Array<{
        id: bigint;
        uuid_externo: string;
        data_hora_agendada: Date;
        duracao_estimada_minutos: number | null;
        paciente_uuid: string;
        paciente_nome: string | null;
        procedimento_principal_uuid: string;
        procedimento_principal_nome: string | null;
        sala_uuid: string;
        sala_nome: string;
        status: string;
        papel: string;
        funcao: string | null;
      }>
    >`
      SELECT DISTINCT ON (c.id)
             c.id,
             c.uuid_externo::text AS uuid_externo,
             c.data_hora_agendada,
             c.duracao_estimada_minutos,
             pa.uuid_externo::text AS paciente_uuid,
             pa.nome               AS paciente_nome,
             tp.uuid_externo::text AS procedimento_principal_uuid,
             tp.nome               AS procedimento_principal_nome,
             sc.uuid_externo::text AS sala_uuid,
             sc.nome               AS sala_nome,
             c.status::text        AS status,
             CASE WHEN c.cirurgiao_id = ${args.prestadorId}::bigint
                  THEN 'CIRURGIAO'
                  ELSE 'EQUIPE'
             END                   AS papel,
             CASE WHEN c.cirurgiao_id = ${args.prestadorId}::bigint
                  THEN 'CIRURGIAO'
                  ELSE ce.funcao
             END                   AS funcao
        FROM cirurgias c
        JOIN pacientes pa             ON pa.id = c.paciente_id
        JOIN tabelas_procedimentos tp ON tp.id = c.procedimento_principal_id
        JOIN salas_cirurgicas sc      ON sc.id = c.sala_id
        LEFT JOIN cirurgias_equipe ce
               ON ce.cirurgia_id = c.id
              AND ce.prestador_id = ${args.prestadorId}::bigint
       WHERE c.deleted_at IS NULL
         AND c.data_hora_agendada >= ${args.inicio}::timestamptz
         AND c.data_hora_agendada <  ${args.fim}::timestamptz
         AND (c.cirurgiao_id = ${args.prestadorId}::bigint
              OR ce.prestador_id = ${args.prestadorId}::bigint)
       ORDER BY c.id ASC
    `;
    return rows
      .map((r) => ({
        ...r,
        papel: r.papel as 'CIRURGIAO' | 'EQUIPE',
      }))
      .sort(
        (a, b) =>
          a.data_hora_agendada.getTime() - b.data_hora_agendada.getTime(),
      );
  }
}
