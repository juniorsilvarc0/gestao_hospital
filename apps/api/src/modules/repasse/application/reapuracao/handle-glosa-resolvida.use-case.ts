/**
 * Reapuração após reversão de glosa (RN-REP-06).
 *
 * Disparado pelo listener `GlosaResolvidaListener` quando o módulo
 * Glosas emite `glosa.recurso_resolvido` (Fase 8 Trilha R-C).
 *
 * Comportamento:
 *   - REVERTIDA_TOTAL / REVERTIDA_PARCIAL:
 *       Para cada item de repasse glosado da conta vinculada à glosa,
 *       cria um novo item no repasse vigente do prestador na competência
 *       atual (cria cabeçalho APURADO se não houver). O valor recalculado
 *       é proporcional ao valor revertido sobre o valor glosado original
 *       (RN-REP-06).
 *   - ACATADA / PERDA_DEFINITIVA:
 *       Marca os itens da conta como glosado=TRUE (afeta valor_bruto via
 *       trigger). Não cria novo lançamento.
 *
 * Idempotência: ao reprocessar o mesmo evento, pode haver dupla-criação
 * de itens. Em produção, recomenda-se sinalizar idempotência via outbox.
 * Para esta entrega, mantemos a operação simples — auditoria registra
 * cada execução.
 */
import Decimal from 'decimal.js';
import { Injectable, Logger } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { GlosasRepository } from '../../../glosas/infrastructure/glosas.repository';
import { RequestContextStorage } from '../../../../common/context/request-context';
import {
  RepasseRepository,
  type RepasseItemRow,
} from '../../infrastructure/repasse.repository';

export interface GlosaResolvidaEventPayload {
  glosaUuid: string;
  contaUuid: string;
  status: string;
  valorRevertido: string;
}

function competenciaAtual(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

@Injectable()
export class HandleGlosaResolvidaUseCase {
  private readonly logger = new Logger(HandleGlosaResolvidaUseCase.name);

  constructor(
    private readonly repo: RepasseRepository,
    private readonly glosas: GlosasRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(payload: GlosaResolvidaEventPayload): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      this.logger.warn(
        { glosaUuid: payload.glosaUuid },
        'HandleGlosaResolvidaUseCase chamado fora de request context — ignorando',
      );
      return;
    }

    const conta = await this.repo.findContaByUuid(payload.contaUuid);
    if (conta === null) {
      this.logger.warn(
        { contaUuid: payload.contaUuid, glosaUuid: payload.glosaUuid },
        'Conta vinculada à glosa não encontrada — ignorando reapuração.',
      );
      return;
    }

    if (
      payload.status === 'ACATADA' ||
      payload.status === 'PERDA_DEFINITIVA'
    ) {
      await this.acataDefinitivo(conta.id, payload);
      return;
    }

    if (
      payload.status === 'REVERTIDA_TOTAL' ||
      payload.status === 'REVERTIDA_PARCIAL'
    ) {
      await this.reapuraReversao(conta.id, payload);
      return;
    }

    this.logger.debug(
      { status: payload.status },
      'Status de glosa não gera reapuração — ignorando.',
    );
  }

  private async acataDefinitivo(
    contaId: bigint,
    payload: GlosaResolvidaEventPayload,
  ): Promise<void> {
    const itens = await this.repo.findRepassesItensByConta(contaId);
    if (itens.length === 0) return;

    let marcados = 0;
    for (const it of itens) {
      if (!it.glosado) {
        await this.repo.markRepasseItemGlosado(it.id);
        marcados += 1;
      }
    }

    if (marcados > 0) {
      // Auditoria — agrupada por conta/glosa.
      await this.auditoria.record({
        tabela: 'repasses_itens',
        registroId: contaId,
        operacao: 'U',
        diff: {
          evento: 'repasse.item_glosado_definitivo',
          glosa_uuid: payload.glosaUuid,
          conta_uuid: payload.contaUuid,
          status: payload.status,
          itens_marcados: marcados,
        },
        finalidade: 'repasse.item_glosado_definitivo',
      });
    }
  }

  private async reapuraReversao(
    contaId: bigint,
    payload: GlosaResolvidaEventPayload,
  ): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return; // já validado em execute()

    // Buscar glosa para conhecer valor_glosado original.
    const glosa = await this.glosas.findGlosaByUuid(payload.glosaUuid);
    if (glosa === null) {
      this.logger.warn(
        { glosaUuid: payload.glosaUuid },
        'Glosa não encontrada — abortando reapuração.',
      );
      return;
    }

    const itensOriginais = await this.repo.findRepassesItensGlosadosByConta(
      contaId,
    );
    if (itensOriginais.length === 0) {
      this.logger.debug(
        { contaUuid: payload.contaUuid },
        'Nenhum item glosado vinculado à conta — nada a reapurar.',
      );
      return;
    }

    const valorGlosadoOriginal = new Decimal(glosa.valor_glosado);
    const valorRevertido = new Decimal(payload.valorRevertido);

    if (valorGlosadoOriginal.lte(0)) {
      this.logger.warn(
        { glosaUuid: payload.glosaUuid },
        'Valor glosado inválido — abortando reapuração.',
      );
      return;
    }

    const proporcao = valorRevertido.div(valorGlosadoOriginal);
    const competencia = competenciaAtual();

    // Agrupa por prestador (cada item pode ser de prestadores distintos).
    const itensPorPrestador = new Map<string, RepasseItemRow[]>();
    for (const it of itensOriginais) {
      // Buscar prestador_id do repasse original — usamos o repasse_id do
      // item para obter via repasse.prestador_id. Não precisamos do
      // prestador_uuid aqui; basta agrupar pelo numérico.
      const key = String(it.repasse_id);
      const arr = itensPorPrestador.get(key);
      if (arr === undefined) {
        itensPorPrestador.set(key, [it]);
      } else {
        arr.push(it);
      }
    }

    let totalCriados = 0;
    for (const [, itens] of itensPorPrestador) {
      // Carrega cabeçalho do repasse original (para descobrir prestador_id).
      const primeiro = itens[0];
      const repasseOriginalRows = await this.findRepassePorId(
        primeiro.repasse_id,
      );
      if (repasseOriginalRows === null) continue;
      const prestadorId = repasseOriginalRows.prestador_id;

      // Garante repasse vigente do prestador na competência atual
      // (APURADO). Se já existir e estiver em status pós-APURADO, ainda
      // anexamos itens — política conservadora: o operador pode preferir
      // criar um repasse separado, mas a base atual permite anexar
      // (status do cabeçalho permanece o que estava).
      let repasseVigente =
        await this.repo.findRepassePorPrestadorCompetencia(
          prestadorId,
          competencia,
        );
      if (repasseVigente === null) {
        const created = await this.repo.insertRepasse({
          tenantId: ctx.tenantId,
          prestadorId,
          competencia,
          observacao: `Reapuração após reversão de glosa ${payload.glosaUuid}`,
          userId: ctx.userId,
        });
        repasseVigente = await this.repo.findRepasseByUuid(created.uuidExterno);
        if (repasseVigente === null) {
          throw new Error('Falha ao localizar repasse criado para reapuração.');
        }
      }

      for (const item of itens) {
        const valorOriginal = new Decimal(item.valor_calculado);
        const valorNovo = valorOriginal.mul(proporcao);
        if (valorNovo.lte(0)) continue;

        await this.repo.insertRepasseItem({
          tenantId: ctx.tenantId,
          repasseId: repasseVigente.id,
          contaId: item.conta_id,
          contaItemId: item.conta_item_id,
          cirurgiaId: item.cirurgia_id,
          criterioId: item.criterio_id,
          funcao: item.funcao,
          baseCalculo: item.base_calculo,
          percentual: item.percentual,
          valorFixo: item.valor_fixo,
          valorCalculado: valorNovo.toFixed(4),
          criterioSnapshot: null,
          reapuradoDeId: item.id,
          glosado: false,
          observacao: `Reapuração: glosa ${payload.glosaUuid} ${payload.status}`,
        });
        totalCriados += 1;
      }
    }

    if (totalCriados > 0) {
      await this.auditoria.record({
        tabela: 'repasses_itens',
        registroId: contaId,
        operacao: 'I',
        diff: {
          evento: 'repasse.reapurado_glosa_revertida',
          glosa_uuid: payload.glosaUuid,
          conta_uuid: payload.contaUuid,
          status: payload.status,
          valor_revertido: payload.valorRevertido,
          competencia,
          itens_criados: totalCriados,
        },
        finalidade: 'repasse.reapurado_glosa_revertida',
      });
    }
  }

  /**
   * Helper para resolver `prestador_id` a partir de `repasse_id` —
   * acesso direto ao tx (mantido aqui para evitar inflar o repository
   * com lookup de uso esporádico).
   */
  private async findRepassePorId(
    repasseId: bigint,
  ): Promise<{ prestador_id: bigint } | null> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) return null;
    const rows = await ctx.tx.$queryRaw<{ prestador_id: bigint }[]>`
      SELECT prestador_id FROM repasses
       WHERE id = ${repasseId}::bigint
       LIMIT 1
    `;
    return rows.length === 0 ? null : rows[0];
  }
}
