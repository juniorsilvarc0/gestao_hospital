/**
 * `POST /v1/atendimentos/:atendUuid/prescricoes` (RN-PEP-05/06, RN-PRE-07).
 *
 * Fluxo (resumo):
 *   1. Resolve atendimento, prescritor, lista de procedimentos por UUID.
 *   2. Roda os 3 validators bloqueantes (alergia, interação, dose).
 *   3. Para cada bloqueio detectado, exige:
 *        - flag `body.overrides.<tipo>` com `justificativa`;
 *        - permissão granular (`prescricoes:override-alergia` etc.) do
 *          usuário logado.
 *      Faltando qualquer dos dois → 422 com `code` específico e detalhe
 *      por item, **sem persistir nada**.
 *   4. Insert `prescricoes` (cabeçalho) + N `prescricoes_itens` em uma
 *      única transação. Os JSONBs `alerta_*` guardam o resultado dos
 *      validators (mesmo quando o caso é apenas informativo, ex.:
 *      interação leve sem bloqueio).
 *   5. Audit `prescricao.criada` (com sumário de bloqueios e overrides).
 *
 * Status inicial é `AGUARDANDO_ANALISE` (RN-PRE-01) — só vira `ATIVA`
 * após `POST /prescricoes/:uuid/analisar` com outcome APROVADA(_RESSALVAS).
 *
 * Esta operação NÃO assina; assinatura é feita por
 * `AssinarPrescricaoUseCase`. Mas a prescrição não-assinada já fica
 * persistida (consistente com `agendamentos`/`evolucoes` que
 * permitem o intermediário "rascunho").
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CriarPrescricaoDto } from '../dto/criar-prescricao.dto';
import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import {
  AlergiaValidator,
  type AlergiaDetectada,
} from '../infrastructure/alergia.validator';
import {
  InteracaoValidator,
  type InteracaoDetectada,
} from '../infrastructure/interacao.validator';
import {
  DoseMaxValidator,
  type DoseMaxExcedida,
} from '../infrastructure/dose-max.validator';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import { PermissionChecker } from '../infrastructure/permission-checker.service';
import { presentPrescricao } from './prescricao.presenter';

interface ItemPlan {
  itemKey: string;          // index estável p/ diagnosticar erros
  procedimentoUuid: string;
  procedimentoId: bigint;
  quantidade: number;
  unidadeMedida: string | null;
  dose: string | null;
  via: string | null;
  frequencia: string | null;
  horarios: string[] | null;
  duracaoDias: number | null;
  urgente: boolean;
  seNecessario: boolean;
  observacao: string | null;
  alergias: AlergiaDetectada[];
  interacoes: InteracaoDetectada[];
  doseExcedida: DoseMaxExcedida | null;
}

@Injectable()
export class CriarPrescricaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrescricoesRepository,
    private readonly alergiaValidator: AlergiaValidator,
    private readonly interacaoValidator: InteracaoValidator,
    private readonly doseValidator: DoseMaxValidator,
    private readonly permissions: PermissionChecker,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: CriarPrescricaoDto,
  ): Promise<PrescricaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CriarPrescricaoUseCase requires a request context.');
    }

    // 1. Resolução de UUIDs.
    const atendimento = await this.repo.findAtendimentoBasics(atendimentoUuid);
    if (atendimento === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const prescritorId = await this.repo.findPrestadorIdByUuid(dto.prescritorUuid);
    if (prescritorId === null) {
      throw new NotFoundException({
        code: 'PRESCRITOR_NOT_FOUND',
        message: 'Prescritor não encontrado.',
      });
    }

    const procUuids = dto.items.map((i) => i.procedimentoUuid);
    const procs = await this.repo.findProcedimentosByUuids(procUuids);
    const missing = procUuids.filter((u) => !procs.has(u));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missing.join(', ')}`,
      });
    }

    // Validação de datas mínima.
    if (
      Number.isNaN(Date.parse(dto.dataHora)) ||
      Number.isNaN(Date.parse(dto.validadeInicio))
    ) {
      throw new BadRequestException({
        code: 'PRESCRICAO_DATAS_INVALIDAS',
        message: 'dataHora ou validadeInicio inválidas.',
      });
    }

    // 2. Build do plano + roda validators.
    const plan: ItemPlan[] = dto.items.map((it, idx) => {
      const proc = procs.get(it.procedimentoUuid);
      if (proc === undefined) {
        throw new Error('procedimento desapareceu após resolução');
      }
      return {
        itemKey: `item-${idx}`,
        procedimentoUuid: it.procedimentoUuid,
        procedimentoId: proc.id,
        quantidade: it.quantidade,
        unidadeMedida: it.unidadeMedida ?? null,
        dose: it.dose ?? null,
        via: it.via ?? null,
        frequencia: it.frequencia ?? null,
        horarios: it.horarios ?? null,
        duracaoDias: it.duracaoDias ?? null,
        urgente: it.urgente ?? false,
        seNecessario: it.seNecessario ?? false,
        observacao: it.observacao ?? null,
        alergias: [],
        interacoes: [],
        doseExcedida: null,
      };
    });

    const procIds = plan.map((p) => p.procedimentoId);

    const alergias = await this.alergiaValidator.validar({
      pacienteId: atendimento.pacienteId,
      procedimentoIds: procIds,
    });
    for (const a of alergias) {
      const item = plan.find((p) => p.procedimentoId === a.procedimentoId);
      if (item !== undefined) item.alergias.push(a);
    }

    const interacoes = await this.interacaoValidator.validar({
      procedimentoIds: procIds,
    });
    for (const i of interacoes) {
      // Anota nos dois itens envolvidos.
      const a = plan.find((p) => p.procedimentoId === i.procedimentoIdA);
      if (a !== undefined) a.interacoes.push(i);
      const b = plan.find((p) => p.procedimentoId === i.procedimentoIdB);
      if (b !== undefined) b.interacoes.push(i);
    }

    const dosesExcedidas = await this.doseValidator.validar({
      items: plan.map((p) => ({
        itemKey: p.itemKey,
        procedimentoId: p.procedimentoId,
        procedimentoUuid: p.procedimentoUuid,
        dose: p.dose,
        frequencia: p.frequencia,
        unidadeMedida: p.unidadeMedida,
        seNecessario: p.seNecessario,
      })),
    });
    for (const d of dosesExcedidas) {
      const item = plan.find((p) => p.itemKey === d.itemKey);
      if (item !== undefined) item.doseExcedida = d;
    }

    // 3. Bloqueios: para cada categoria, se houve detecção e o caller
    // não autorizou (overrides + permissão), recusa.
    const hasAlergiaBloqueante = plan.some((p) => p.alergias.length > 0);
    const hasInteracaoBloqueante = plan.some((p) =>
      p.interacoes.some((i) => i.bloqueante),
    );
    const hasDoseBloqueante = plan.some((p) => p.doseExcedida !== null);

    if (hasAlergiaBloqueante) {
      await this.assertOverride({
        tipo: 'ALERGIA',
        flag: dto.overrides?.alergia,
        recurso: 'prescricoes',
        acao: 'override-alergia',
        usuarioId: ctx.userId,
        codeError: 'PRESCRICAO_ALERGIA_DETECTADA',
        mensagemError: 'Alergia documentada — override exige justificativa e permissão.',
        detalhes: plan
          .filter((p) => p.alergias.length > 0)
          .map((p) => ({
            itemKey: p.itemKey,
            procedimentoUuid: p.procedimentoUuid,
            alergias: p.alergias.map((a) => ({
              substancia: a.alergia.substancia,
              gravidade: a.alergia.gravidade,
              principio: a.principio,
            })),
          })),
      });
    }

    if (hasInteracaoBloqueante) {
      await this.assertOverride({
        tipo: 'INTERACAO',
        flag: dto.overrides?.interacao,
        recurso: 'prescricoes',
        acao: 'override-interacao',
        usuarioId: ctx.userId,
        codeError: 'PRESCRICAO_INTERACAO_GRAVE',
        mensagemError:
          'Interação medicamentosa GRAVE/CONTRAINDICADA — override exige justificativa e permissão.',
        detalhes: plan
          .flatMap((p) =>
            p.interacoes
              .filter((i) => i.bloqueante)
              .map((i) => ({
                itemKey: p.itemKey,
                procedimentoUuid: p.procedimentoUuid,
                interacao: {
                  com: i.principioA + ' ↔ ' + i.principioB,
                  severidade: i.severidade,
                  descricao: i.descricao,
                },
              })),
          )
          .filter(
            (v, i, arr) =>
              arr.findIndex(
                (x) =>
                  x.itemKey === v.itemKey &&
                  x.interacao.com === v.interacao.com,
              ) === i,
          ),
      });
    }

    if (hasDoseBloqueante) {
      await this.assertOverride({
        tipo: 'DOSE_MAX',
        flag: dto.overrides?.doseMax,
        recurso: 'prescricoes',
        acao: 'override-dose',
        usuarioId: ctx.userId,
        codeError: 'PRESCRICAO_DOSE_MAX_EXCEDIDA',
        mensagemError:
          'Dose máxima diária excedida — override exige justificativa e permissão.',
        detalhes: plan
          .filter((p) => p.doseExcedida !== null)
          .map((p) => ({
            itemKey: p.itemKey,
            procedimentoUuid: p.procedimentoUuid,
            doseSolicitada: p.doseExcedida?.doseSolicitada ?? null,
            doseMaxDia: p.doseExcedida?.doseMaxDia ?? null,
            unidade: p.doseExcedida?.unidade ?? null,
            principio: p.doseExcedida?.principio ?? null,
          })),
      });
    }

    // 4. Persistência (uma transação implícita via prisma.tx() — já
    // estamos dentro da $transaction do TenantContextInterceptor).
    const tx = this.prisma.tx();

    const prescricaoRow = await tx.$queryRaw<{
      id: bigint;
      data_hora: Date;
      uuid_externo: string;
    }[]>`
      INSERT INTO prescricoes (
        tenant_id, atendimento_id, paciente_id, prescritor_id,
        data_hora, tipo, validade_inicio, validade_fim,
        status, observacao_geral, created_by
      ) VALUES (
        ${ctx.tenantId}::bigint,
        ${atendimento.id}::bigint,
        ${atendimento.pacienteId}::bigint,
        ${prescritorId}::bigint,
        ${dto.dataHora}::timestamptz,
        ${dto.tipo}::enum_prescricao_tipo,
        ${dto.validadeInicio}::timestamptz,
        ${dto.validadeFim ?? null}::timestamptz,
        'AGUARDANDO_ANALISE'::enum_prescricao_status,
        ${dto.observacaoGeral ?? null},
        ${ctx.userId}::bigint
      )
      RETURNING id, data_hora, uuid_externo::text AS uuid_externo
    `;
    if (prescricaoRow.length === 0) {
      throw new Error('INSERT prescricoes não retornou linha.');
    }
    const presc = prescricaoRow[0];

    // INSERT itens + JSONB de alertas.
    for (const item of plan) {
      const alertaAlergia =
        item.alergias.length > 0
          ? {
              detectada: true,
              override:
                dto.overrides?.alergia !== undefined
                  ? {
                      justificativa: dto.overrides.alergia.justificativa,
                      autor: ctx.userId.toString(),
                    }
                  : null,
              alergias: item.alergias.map((a) => ({
                principio: a.principio,
                substancia: a.alergia.substancia,
                gravidade: a.alergia.gravidade,
              })),
            }
          : null;

      const alertaInteracao =
        item.interacoes.length > 0
          ? {
              detectada: true,
              bloqueante: item.interacoes.some((i) => i.bloqueante),
              override:
                hasInteracaoBloqueante && dto.overrides?.interacao !== undefined
                  ? {
                      justificativa: dto.overrides.interacao.justificativa,
                      autor: ctx.userId.toString(),
                    }
                  : null,
              interacoes: item.interacoes.map((i) => ({
                par: i.principioA + ' ↔ ' + i.principioB,
                severidade: i.severidade,
                descricao: i.descricao,
                fonte: i.fonte,
              })),
            }
          : null;

      const alertaDoseMax =
        item.doseExcedida !== null
          ? {
              detectado: true,
              doseSolicitada: item.doseExcedida.doseSolicitada,
              doseMaxDia: item.doseExcedida.doseMaxDia,
              unidade: item.doseExcedida.unidade,
              principio: item.doseExcedida.principio,
              vezesPorDia: item.doseExcedida.vezesPorDia,
              override:
                dto.overrides?.doseMax !== undefined
                  ? {
                      justificativa: dto.overrides.doseMax.justificativa,
                      autor: ctx.userId.toString(),
                    }
                  : null,
            }
          : null;

      await tx.$executeRaw`
        INSERT INTO prescricoes_itens (
          tenant_id, prescricao_id, prescricao_data_hora, procedimento_id,
          quantidade, unidade_medida, dose, via, frequencia, horarios,
          duracao_dias, urgente, se_necessario, observacao,
          alerta_alergia, alerta_interacao, alerta_dose_max, status_item
        ) VALUES (
          ${ctx.tenantId}::bigint,
          ${presc.id}::bigint,
          ${presc.data_hora}::timestamptz,
          ${item.procedimentoId}::bigint,
          ${item.quantidade}::numeric,
          ${item.unidadeMedida},
          ${item.dose},
          ${item.via},
          ${item.frequencia},
          ${item.horarios === null ? null : JSON.stringify(item.horarios)}::jsonb,
          ${item.duracaoDias},
          ${item.urgente},
          ${item.seNecessario},
          ${item.observacao},
          ${alertaAlergia === null ? null : JSON.stringify(alertaAlergia)}::jsonb,
          ${alertaInteracao === null ? null : JSON.stringify(alertaInteracao)}::jsonb,
          ${alertaDoseMax === null ? null : JSON.stringify(alertaDoseMax)}::jsonb,
          'ATIVO'
        )
      `;
    }

    // 5. Auditoria lógica.
    await this.auditoria.record({
      tabela: 'prescricoes',
      registroId: presc.id,
      operacao: 'I',
      diff: {
        evento: 'prescricao.criada',
        atendimento_id: atendimento.id.toString(),
        prescritor_id: prescritorId.toString(),
        tipo: dto.tipo,
        n_itens: plan.length,
        bloqueios: {
          alergia: hasAlergiaBloqueante,
          interacao: hasInteracaoBloqueante,
          dose: hasDoseBloqueante,
        },
        overrides: {
          alergia: dto.overrides?.alergia !== undefined,
          interacao: dto.overrides?.interacao !== undefined,
          dose: dto.overrides?.doseMax !== undefined,
        },
      },
      finalidade: 'prescricao.criada',
    });

    const created = await this.repo.findPrescricaoByUuid(presc.uuid_externo);
    if (created === null) {
      throw new Error('Prescrição criada não encontrada (RLS?).');
    }
    const itens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(created, itens);
  }

  private async assertOverride(input: {
    tipo: string;
    flag?: { justificativa: string };
    recurso: string;
    acao: string;
    usuarioId: bigint;
    codeError: string;
    mensagemError: string;
    detalhes: unknown[];
  }): Promise<void> {
    if (input.flag === undefined) {
      throw new UnprocessableEntityException({
        code: input.codeError,
        message: input.mensagemError,
        detalhes: input.detalhes,
      });
    }
    if (input.flag.justificativa.trim().length < 5) {
      throw new BadRequestException({
        code: 'PRESCRICAO_OVERRIDE_JUSTIFICATIVA_REQUIRED',
        message: 'Justificativa de override exige no mínimo 5 caracteres.',
      });
    }
    const allow = await this.permissions.hasPermission(
      input.usuarioId,
      input.recurso,
      input.acao,
    );
    if (!allow) {
      throw new ForbiddenException({
        code: 'PRESCRICAO_OVERRIDE_FORBIDDEN',
        message: `Sem permissão para override (${input.recurso}:${input.acao}).`,
      });
    }
  }
}
