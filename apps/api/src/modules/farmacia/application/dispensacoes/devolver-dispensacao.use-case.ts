/**
 * `POST /v1/dispensacoes/{uuid}/devolver` — devolução de itens (RN-FAR-04).
 *
 * Cria uma NOVA dispensação tipo `DEVOLUCAO` apontando para a original.
 * Para cada item devolvido:
 *   1. Cria item correspondente na nova dispensação (PENDENTE).
 *   2. Soft-delete do `conta_item_id` original (`deleted_at = now(),
 *      deleted_by = userId`) — não emitimos quantidade negativa.
 *   3. Reverte saída do livro de controlados (movimento `ENTRADA`)
 *      quando o procedimento é controlado.
 *   4. Atualiza original → DEVOLVIDA.
 *
 * O cabeçalho original é marcado como DEVOLVIDA. Se a devolução for
 * parcial, deixa-se claro pela quantidade no item da nova dispensação;
 * o status do cabeçalho original ainda é DEVOLVIDA (decisão simples
 * para Fase 7 — Fase 9/glosas pode estender se necessário).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  nextStatus,
  turnoFromDate,
} from '../../domain/dispensacao';
import { calcularSaldo } from '../../domain/livro-controlados';
import type { DevolverDispensacaoDto } from '../../dto/devolver.dto';
import type { DispensacaoResponse } from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentDispensacao } from './dispensacao.presenter';

@Injectable()
export class DevolverDispensacaoUseCase {
  constructor(
    private readonly repo: FarmaciaRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: DevolverDispensacaoDto,
  ): Promise<DispensacaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DevolverDispensacaoUseCase requires request context.');
    }

    const original = await this.repo.findDispensacaoByUuid(uuid);
    if (original === null) {
      throw new NotFoundException({
        code: 'DISPENSACAO_NOT_FOUND',
        message: 'Dispensação não encontrada.',
      });
    }
    const novoStatus = nextStatus(original.status, 'devolver');
    if (novoStatus === null) {
      throw new ConflictException({
        code: 'DISPENSACAO_STATUS_INVALIDO',
        message: `Apenas dispensações DISPENSADA podem ser devolvidas (atual: ${original.status}).`,
      });
    }

    const itensOriginais = await this.repo.findItensByDispensacaoId(
      original.id,
      original.data_hora,
    );
    const mapByUuid = new Map(
      itensOriginais.map((i) => [i.uuid_externo, i]),
    );

    // Valida itens da devolução.
    for (const it of dto.itens) {
      const original = mapByUuid.get(it.itemOriginalUuid);
      if (original === undefined) {
        throw new NotFoundException({
          code: 'DISPENSACAO_ITEM_NOT_FOUND',
          message: `Item ${it.itemOriginalUuid} não pertence à dispensação.`,
        });
      }
      const dispensada = Number(original.quantidade_dispensada);
      if (it.quantidadeDevolvida > dispensada) {
        throw new UnprocessableEntityException({
          code: 'DEVOLUCAO_QTD_EXCEDE',
          message: `Quantidade devolvida (${it.quantidadeDevolvida}) excede a dispensada (${dispensada}) no item ${it.itemOriginalUuid}.`,
        });
      }
    }

    const farmaceuticoId = await this.repo.findPrestadorIdByUserId(
      ctx.userId,
    );
    if (farmaceuticoId === null) {
      throw new UnprocessableEntityException({
        code: 'USUARIO_SEM_PRESTADOR',
        message: 'Usuário não está vinculado a um prestador.',
      });
    }

    // 1. Cria nova dispensação tipo DEVOLUCAO.
    const dataHoraIso = new Date().toISOString();
    const dataHora = new Date(dataHoraIso);
    const turno = turnoFromDate(dataHora);
    const novaDisp = await this.repo.insertDispensacao({
      tenantId: ctx.tenantId,
      atendimentoId: original.atendimento_id,
      pacienteId: original.paciente_id,
      prescricaoId: original.prescricao_id,
      prescricaoDataHora: original.prescricao_data_hora,
      cirurgiaId: original.cirurgia_id,
      setorDestinoId: original.setor_destino_id,
      farmaceuticoId,
      dataHora: dataHoraIso,
      turno,
      tipo: 'DEVOLUCAO',
      observacao:
        `DEVOLUCAO: ${dto.motivoDevolucao}` +
        (dto.observacao !== undefined ? ` — ${dto.observacao}` : ''),
      dispensacaoOrigemId: original.id,
      dispensacaoOrigemDataHora: original.data_hora,
      userId: ctx.userId,
    });

    let revertidos = 0;

    for (const it of dto.itens) {
      const orig = mapByUuid.get(it.itemOriginalUuid);
      if (orig === undefined) continue;
      // Insere item da devolução.
      await this.repo.insertDispensacaoItem({
        tenantId: ctx.tenantId,
        dispensacaoId: novaDisp.id,
        dispensacaoDataHora: novaDisp.dataHora,
        procedimentoId: orig.procedimento_id,
        prescricaoItemId: orig.prescricao_item_id,
        quantidadePrescrita: it.quantidadeDevolvida,
        quantidadeDispensada: it.quantidadeDevolvida,
        unidadeMedida: orig.unidade_medida,
        fatorConversaoAplicado: null,
        justificativaDivergencia: null,
        lote: orig.lote,
        validade: orig.validade
          ? orig.validade.toISOString().slice(0, 10)
          : null,
      });

      // Soft-delete contas_itens (RN-FAR-04).
      if (orig.conta_item_id !== null) {
        await this.repo.softDeleteContaItem(orig.conta_item_id, ctx.userId);
      }

      // Controlado: movimento ENTRADA reverte a saída.
      if (orig.procedimento_controlado && orig.lote !== null) {
        const saldo = await this.repo.findSaldoAtual(
          orig.procedimento_id,
          orig.lote,
        );
        const saldoAnteriorStr = saldo?.saldoAtual ?? '0';
        const calc = calcularSaldo(
          saldoAnteriorStr,
          String(it.quantidadeDevolvida),
          'ENTRADA',
        );
        await this.repo.insertMovimentoControlado({
          tenantId: ctx.tenantId,
          procedimentoId: orig.procedimento_id,
          lote: orig.lote,
          quantidade: String(it.quantidadeDevolvida),
          saldoAnterior: calc.saldoAnterior,
          saldoAtual: calc.saldoAtual,
          tipoMovimento: 'ENTRADA',
          pacienteId: original.paciente_id,
          prescricaoId: original.prescricao_id,
          prescricaoDataHora: original.prescricao_data_hora,
          dispensacaoItemId: orig.id,
          receitaDocumentoUrl: null,
          farmaceuticoId,
          observacao: `Devolução de dispensação ${original.uuid_externo}`,
        });
        revertidos += 1;
      }
    }

    // Confirma a nova dispensação como DISPENSADA (devolução é
    // imediata — sem fluxo de separar/dispensar). Os itens da nova
    // dispensação ficam com `status = PENDENTE` (default) — semântica
    // ok porque não há uso clínico posterior, e evita re-resolver os
    // ids de cada item recém-inserido.
    await this.repo.updateDispensacaoStatus(
      novaDisp.id,
      novaDisp.dataHora,
      'DISPENSADA',
    );
    // Marca original como DEVOLVIDA.
    await this.repo.updateDispensacaoStatus(
      original.id,
      original.data_hora,
      'DEVOLVIDA',
    );

    await this.auditoria.record({
      tabela: 'dispensacoes',
      registroId: original.id,
      operacao: 'U',
      diff: {
        evento: 'dispensacao.devolvida',
        nova_dispensacao_id: novaDisp.id.toString(),
        nova_dispensacao_uuid: novaDisp.uuidExterno,
        n_itens_devolvidos: dto.itens.length,
        controlados_revertidos: revertidos,
      },
      finalidade: 'dispensacao.devolvida',
    });

    // Devolve a NOVA dispensação (representa o ato de devolução).
    const updated = await this.repo.findDispensacaoByUuid(novaDisp.uuidExterno);
    if (updated === null) {
      throw new Error('Dispensação devolução não encontrada (RLS?).');
    }
    const updatedItens = await this.repo.findItensByDispensacaoId(
      novaDisp.id,
      novaDisp.dataHora,
    );
    const presented = presentDispensacao(updated, updatedItens);

    this.events.emit('dispensacao.devolvida', {
      tenantId: ctx.tenantId.toString(),
      dispensacao: presented,
      originalUuid: original.uuid_externo,
    });

    return presented;
  }
}
