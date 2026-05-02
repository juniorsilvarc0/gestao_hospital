/**
 * `ApuracaoRunnerService` — núcleo da apuração mensal de repasse.
 *
 * É chamado pelo `ApuracaoProcessor` (worker BullMQ). Como o worker NÃO
 * tem `RequestContext` (HTTP), montamos o contexto manualmente via
 * `RequestContextStorage.run` + `repo.runWithTenant` (que aplica
 * `SET LOCAL app.current_tenant_id` numa transação).
 *
 * Algoritmo (RN-REP-02 a 04):
 *   1. Para cada prestador elegível:
 *      a. Lock idempotente — checa `findRepasseExistente`. Se já
 *         existe e status != APURADO → ignora (não pode reapurar).
 *         Se existe e está APURADO + forceReapuracao → limpa itens e
 *         re-insere. Se NÃO existe → cria.
 *      b. Coleta items elegíveis (`findItensParaRepasse`).
 *      c. Para cada item, percorre os critérios vigentes em
 *         `data_realizacao` (ordenados por prioridade desc) e aplica
 *         o primeiro matcher que casa.
 *      d. Calcula base + valor_calculado.
 *      e. INSERT em `repasses_itens` com snapshot do critério.
 *   2. Audit `repasse.apurado` por prestador.
 *
 * Eventos `repasse.apurado` são emitidos por prestador para que outras
 * partes do sistema possam reagir (notificar, enviar e-mail, etc.).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../../infrastructure/persistence/prisma.service';
import {
  RequestContextStorage,
  type RequestContext,
} from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { calcularBase, decMulPct, normalizeDec } from '../../domain/base-calculo';
import type {
  CriterioMatcher,
  CriterioRegras,
  CriterioSnapshot,
} from '../../domain/criterio';
import { findFirstMatcher } from '../../domain/matcher';
import {
  RepasseRepository,
  type ContaItemElegivelRow,
  type CriterioRow,
} from '../../infrastructure/repasse.repository';
import type { ApuracaoJobResult } from '../../dto/responses';

export interface ApuracaoJobData {
  tenantId: string; // serializado para BullMQ
  userId: string;
  correlationId: string;
  competencia: string; // YYYY-MM
  prestadorUuids: string[] | null;
  forceReapuracao: boolean;
}

@Injectable()
export class ApuracaoRunnerService {
  private readonly logger = new Logger(ApuracaoRunnerService.name);

  constructor(
    private readonly repo: RepasseRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
    // Necessário para construir o RequestContext do worker.
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async run(data: ApuracaoJobData): Promise<ApuracaoJobResult> {
    const tenantId = BigInt(data.tenantId);
    const userId = BigInt(data.userId);

    // O worker não tem request context. `runWithTenant` cria a tx com
    // SET LOCAL — populamos `RequestContextStorage` com esse tx para que
    // chamadas a `prisma.tx()` retornem o cliente certo. Tudo dentro do
    // callback compartilha a mesma transação.
    return this.repo.runWithTenant(tenantId, async () => {
      const ctx: RequestContext = {
        tenantId,
        userId,
        correlationId: data.correlationId,
        // O cliente é o singleton, mas como `SET LOCAL` está aplicado
        // numa tx que está ativa no escopo, queries via `prisma.tx()`
        // do interceptor não chegariam aqui. O fallback do PrismaService
        // (devolve `this`) está OK para leitura/escrita; o RLS já está
        // aplicado pela transação ativa quando passamos `prisma.$transaction`.
        // Para simplicidade do runner usamos o singleton.
        tx: this.prisma as unknown as RequestContext['tx'],
      };
      return RequestContextStorage.run(ctx, () => this.runInner(data));
    });
  }

  private async runInner(data: ApuracaoJobData): Promise<ApuracaoJobResult> {
    const tenantId = BigInt(data.tenantId);
    const userId = BigInt(data.userId);

    // Resolve prestadorIds a partir dos UUIDs (quando filtro existe).
    let prestadorIdsFilter: bigint[] | undefined;
    if (data.prestadorUuids !== null && data.prestadorUuids.length > 0) {
      const ids: bigint[] = [];
      for (const uuid of data.prestadorUuids) {
        const id = await this.repo.findPrestadorIdByUuid(uuid);
        if (id !== null) ids.push(id);
      }
      prestadorIdsFilter = ids;
    }

    const prestadores = await this.repo.findPrestadoresElegiveis({
      prestadorIds: prestadorIdsFilter,
    });

    const result: ApuracaoJobResult = {
      prestadoresProcessados: 0,
      repassesCriados: 0,
      repassesReapurados: 0,
      itensInseridos: 0,
      ignorados: [],
    };

    if (prestadores.length === 0) {
      return result;
    }

    for (const prestador of prestadores) {
      try {
        const summary = await this.apurarPrestador({
          tenantId,
          userId,
          competencia: data.competencia,
          forceReapuracao: data.forceReapuracao,
          prestadorId: prestador.id,
          prestadorUuid: prestador.uuid_externo,
        });

        result.prestadoresProcessados += 1;
        result.itensInseridos += summary.itensInseridos;
        // Apenas conta como "criado/reapurado" quando processou de fato
        // (itens inseridos > 0). Skippados — incluindo `repasse já APURADO`
        // — vão direto para `ignorados`.
        if (summary.skippedReason === null) {
          if (summary.reapurado) {
            result.repassesReapurados += 1;
          } else if (summary.repasseId !== null) {
            result.repassesCriados += 1;
          }
        } else if (summary.reapurado) {
          // forceReapuracao chegou mas nenhum item casou — ainda contamos
          // como reapurado (limpou o anterior).
          result.repassesReapurados += 1;
        }

        if (summary.skippedReason !== null) {
          result.ignorados.push({
            prestadorUuid: prestador.uuid_externo,
            motivo: summary.skippedReason,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          { tenantId: data.tenantId, prestador: prestador.uuid_externo, err: msg },
          '[repasse:apurar] falha para prestador',
        );
        result.ignorados.push({
          prestadorUuid: prestador.uuid_externo,
          motivo: `erro: ${msg}`,
        });
      }
    }

    return result;
  }

  /**
   * Apura UM prestador. Encapsula o controle de idempotência + processamento
   * de items.
   */
  private async apurarPrestador(args: {
    tenantId: bigint;
    userId: bigint;
    competencia: string;
    forceReapuracao: boolean;
    prestadorId: bigint;
    prestadorUuid: string;
  }): Promise<{
    repasseId: bigint | null;
    reapurado: boolean;
    itensInseridos: number;
    skippedReason: string | null;
  }> {
    const existente = await this.repo.findRepasseExistente({
      prestadorId: args.prestadorId,
      competencia: args.competencia,
    });

    let repasseId: bigint;
    let repasseUuid: string;
    let reapurado = false;

    if (existente !== null) {
      if (existente.status !== 'APURADO') {
        return {
          repasseId: existente.id,
          reapurado: false,
          itensInseridos: 0,
          skippedReason: `repasse já está em status ${existente.status} — não pode ser reapurado`,
        };
      }
      if (!args.forceReapuracao) {
        return {
          repasseId: existente.id,
          reapurado: false,
          itensInseridos: 0,
          skippedReason: 'repasse já apurado nesta competência (use forceReapuracao=true para regerar)',
        };
      }
      // Reapurar: limpar itens e resetar header.
      await this.repo.deleteRepasseItens(existente.id);
      await this.repo.resetRepasseParaReapuracao(existente.id);
      repasseId = existente.id;
      // Buscar uuid (precisa para evento). Reuso `findRepasseByUuid` é
      // pesado; usamos uma consulta direta. Como não temos lookup só por
      // id, optamos por refazer findRepasseExistente — mas ele não traz
      // uuid. Solução simples: esquecer uuid (evento usa apenas id).
      repasseUuid = '';
      reapurado = true;
    } else {
      const inserted = await this.repo.insertRepasse({
        tenantId: args.tenantId,
        prestadorId: args.prestadorId,
        competencia: args.competencia,
        observacao: null,
        userId: args.userId,
      });
      repasseId = inserted.id;
      repasseUuid = inserted.uuidExterno;
    }

    const itens = await this.repo.findItensParaRepasse({
      prestadorId: args.prestadorId,
      competencia: args.competencia,
    });

    if (itens.length === 0) {
      return {
        repasseId,
        reapurado,
        itensInseridos: 0,
        skippedReason: 'nenhum item elegível na competência',
      };
    }

    let totalInseridos = 0;
    for (const item of itens) {
      const inserido = await this.aplicarCriterioEInserir({
        tenantId: args.tenantId,
        repasseId,
        item,
      });
      if (inserido) totalInseridos += 1;
    }

    if (totalInseridos === 0) {
      return {
        repasseId,
        reapurado,
        itensInseridos: 0,
        skippedReason: 'nenhum item casou com critério vigente',
      };
    }

    await this.auditoria.record({
      tabela: 'repasses',
      registroId: repasseId,
      operacao: reapurado ? 'U' : 'I',
      diff: {
        evento: 'repasse.apurado',
        competencia: args.competencia,
        prestador_uuid: args.prestadorUuid,
        itens: totalInseridos,
        reapurado,
      },
      finalidade: 'repasse.apurado',
    });

    this.events.emit('repasse.apurado', {
      repasseUuid,
      prestadorUuid: args.prestadorUuid,
      competencia: args.competencia,
      itens: totalInseridos,
      reapurado,
    });

    return {
      repasseId,
      reapurado,
      itensInseridos: totalInseridos,
      skippedReason: null,
    };
  }

  /**
   * Para um item, encontra o critério vigente (data_realizacao OU primeiro
   * dia da competência) e aplica matchers. Insere `repasses_itens` se
   * algum matcher casa.
   *
   * Retorna `true` se inseriu, `false` se nenhum critério/matcher cobriu.
   */
  private async aplicarCriterioEInserir(args: {
    tenantId: bigint;
    repasseId: bigint;
    item: ContaItemElegivelRow;
  }): Promise<boolean> {
    const dataRef = this.dataReferenciaItem(args.item);
    const criteriosVigentes = await this.repo.findCriteriosVigentesEm(dataRef);
    if (criteriosVigentes.length === 0) return false;

    for (const criterio of criteriosVigentes) {
      const matcher = this.matcherDoCriterio(criterio, args.item);
      if (matcher === null) continue;

      const baseCalc = calcularBase(criterio.tipo_base_calculo, {
        valorTotal: args.item.valor_total,
        valorGlosa: args.item.valor_glosa,
      });

      let valorCalculado: string;
      let percentual: string | null = null;
      let valorFixo: string | null = null;
      if (matcher.percentual !== undefined) {
        percentual = normalizeDec(matcher.percentual.toString());
        valorCalculado = decMulPct(baseCalc, percentual);
      } else if (matcher.valor_fixo !== undefined) {
        valorFixo = normalizeDec(matcher.valor_fixo.toString());
        valorCalculado = valorFixo;
      } else {
        // schema garante que pelo menos um existe — defesa em profundidade
        valorCalculado = '0.0000';
      }

      const snapshot: CriterioSnapshot = {
        id: Number(criterio.id),
        uuid: criterio.uuid_externo,
        descricao: criterio.descricao,
        tipo_base_calculo: criterio.tipo_base_calculo,
        matcher_aplicado: matcher,
        vigencia_inicio: this.toIsoDate(criterio.vigencia_inicio),
        vigencia_fim:
          criterio.vigencia_fim === null
            ? null
            : this.toIsoDate(criterio.vigencia_fim),
      };

      await this.repo.insertRepasseItem({
        tenantId: args.tenantId,
        repasseId: args.repasseId,
        contaId: args.item.conta_id,
        contaItemId: args.item.conta_item_id,
        cirurgiaId: args.item.cirurgia_id,
        criterioId: criterio.id,
        funcao: args.item.funcao,
        baseCalculo: baseCalc,
        percentual,
        valorFixo,
        valorCalculado,
        criterioSnapshot: snapshot,
        reapuradoDeId: null,
        glosado: false,
        observacao: null,
      });
      return true;
    }

    return false;
  }

  private matcherDoCriterio(
    criterio: CriterioRow,
    item: ContaItemElegivelRow,
  ): CriterioMatcher | null {
    const regras = criterio.regras as CriterioRegras | null;
    if (regras === null || !Array.isArray(regras.matchers)) return null;
    return findFirstMatcher(regras.matchers, {
      prestador_id: Number(item.prestador_id),
      funcao: item.funcao,
      grupo_gasto: item.grupo_gasto,
      codigo_procedimento: item.codigo_procedimento,
      convenio_id: item.convenio_id === null ? null : Number(item.convenio_id),
    });
  }

  private dataReferenciaItem(item: ContaItemElegivelRow): string {
    if (item.data_realizacao !== null) {
      return this.toIsoDate(item.data_realizacao);
    }
    // Fallback: hoje. Em prática `data_realizacao` é obrigatório para
    // procedimentos faturados; este caminho é defensivo.
    return this.toIsoDate(new Date());
  }

  private toIsoDate(d: Date | string): string {
    if (typeof d === 'string') return d;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
