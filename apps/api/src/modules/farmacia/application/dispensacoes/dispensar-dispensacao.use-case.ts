/**
 * `POST /v1/dispensacoes/{uuid}/dispensar` — confirmação final
 * (RN-FAR-05).
 *
 * Para cada item:
 *   1. Se procedimento é controlado: valida saldo do par (procedimento,
 *      lote) e insere movimento `SAIDA` em `livro_controlados`. Saldo
 *      negativo ⇒ 422 (não deixa cair no `RAISE EXCEPTION` da trigger).
 *   2. Insere registro em `contas_itens` (esqueleto — Fase 8 calcula
 *      valor unitário). `origem='FARMACIA'`,
 *      `origem_referencia_tipo='dispensacao_item'`, `setor_id =
 *      atendimentos.setor_id` (setor do paciente).
 *   3. Atualiza `dispensacoes_itens`: `conta_item_id` + status DISPENSADA.
 *
 * No final, cabeçalho vai a DISPENSADA, audita e emite evento de
 * domínio.
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
import { nextStatus } from '../../domain/dispensacao';
import { calcularSaldo } from '../../domain/livro-controlados';
import type { DispensacaoResponse } from '../../dto/responses';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';
import { presentDispensacao } from './dispensacao.presenter';

const GRUPO_GASTO_MEDICAMENTO_OU_MATERIAL = new Set([
  'MEDICAMENTO',
  'MATERIAL',
  'OPME',
  'GAS',
]);

@Injectable()
export class DispensarDispensacaoUseCase {
  constructor(
    private readonly repo: FarmaciaRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(uuid: string): Promise<DispensacaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('DispensarDispensacaoUseCase requires request context.');
    }

    const disp = await this.repo.findDispensacaoByUuid(uuid);
    if (disp === null) {
      throw new NotFoundException({
        code: 'DISPENSACAO_NOT_FOUND',
        message: 'Dispensação não encontrada.',
      });
    }
    const novo = nextStatus(disp.status, 'dispensar');
    if (novo === null) {
      throw new ConflictException({
        code: 'DISPENSACAO_STATUS_INVALIDO',
        message: `Dispensação no status ${disp.status} não pode ser dispensada.`,
      });
    }

    const itens = await this.repo.findItensByDispensacaoId(
      disp.id,
      disp.data_hora,
    );
    if (itens.length === 0) {
      throw new UnprocessableEntityException({
        code: 'DISPENSACAO_SEM_ITENS',
        message: 'Dispensação sem itens — nada a confirmar.',
      });
    }

    // Conta do atendimento (Fase 8 cuida da abertura — aqui assumimos
    // que existe; senão, escapamos com 422 para que a UI saiba abrir
    // a conta primeiro).
    const contaId = await this.repo.findAtendimentoContaId(
      disp.atendimento_id,
    );
    if (contaId === null) {
      throw new UnprocessableEntityException({
        code: 'CONTA_NAO_ABERTA',
        message:
          'O atendimento ainda não possui conta aberta — não é possível registrar itens.',
      });
    }

    const contadores = {
      itensConfirmados: 0,
      controladosLancados: 0,
      contasItensInseridos: 0,
    };

    for (const item of itens) {
      // Saída em livro de controlados, se aplicável.
      if (item.procedimento_controlado) {
        if (item.lote === null) {
          throw new UnprocessableEntityException({
            code: 'CONTROLADO_LOTE_OBRIGATORIO',
            message: `Item controlado #${item.id.toString()} dispensado sem lote (RN-FAR-05).`,
          });
        }
        const saldo = await this.repo.findSaldoAtual(
          item.procedimento_id,
          item.lote,
        );
        const saldoAnteriorStr = saldo?.saldoAtual ?? '0';
        const calc = calcularSaldo(
          saldoAnteriorStr,
          item.quantidade_dispensada,
          'SAIDA',
        );
        if (calc.saldoNegativo) {
          throw new UnprocessableEntityException({
            code: 'CONTROLADO_SALDO_NEGATIVO',
            message: `Saldo de controlado insuficiente para procedimento ${item.procedimento_uuid} (lote ${item.lote}).`,
            detalhes: {
              saldoAtual: saldoAnteriorStr,
              quantidadeRequerida: item.quantidade_dispensada,
            },
          });
        }
        await this.repo.insertMovimentoControlado({
          tenantId: ctx.tenantId,
          procedimentoId: item.procedimento_id,
          lote: item.lote,
          quantidade: item.quantidade_dispensada,
          saldoAnterior: calc.saldoAnterior,
          saldoAtual: calc.saldoAtual,
          tipoMovimento: 'SAIDA',
          pacienteId: disp.paciente_id,
          prescricaoId: disp.prescricao_id,
          prescricaoDataHora: disp.prescricao_data_hora,
          dispensacaoItemId: item.id,
          receitaDocumentoUrl: null,
          farmaceuticoId: disp.farmaceutico_id,
          observacao: null,
        });
        contadores.controladosLancados += 1;
      }

      // contas_itens (Fase 8 calcula valor; aqui só esqueleto).
      const grupo = GRUPO_GASTO_MEDICAMENTO_OU_MATERIAL.has(
        item.procedimento_grupo_gasto,
      )
        ? item.procedimento_grupo_gasto
        : 'MATERIAL';
      // Resolve setor do atendimento (paciente).
      const atendimento = await this.repo.findAtendimentoBasics(
        disp.atendimento_uuid,
      );
      const setorId = atendimento?.setorId ?? null;
      const inserted = await this.repo.insertContaItem({
        tenantId: ctx.tenantId,
        contaId,
        procedimentoId: item.procedimento_id,
        grupoGasto: grupo,
        quantidade: item.quantidade_dispensada,
        setorId,
        lote: item.lote,
        validade: item.validade
          ? item.validade.toISOString().slice(0, 10)
          : null,
        origemReferenciaId: item.id,
        userId: ctx.userId,
      });
      await this.repo.setDispensacaoItemContaId(item.id, inserted.id);
      contadores.contasItensInseridos += 1;
      contadores.itensConfirmados += 1;
    }

    await this.repo.updateDispensacaoStatus(
      disp.id,
      disp.data_hora,
      'DISPENSADA',
    );

    await this.auditoria.record({
      tabela: 'dispensacoes',
      registroId: disp.id,
      operacao: 'U',
      diff: {
        evento: 'dispensacao.dispensada',
        status_anterior: disp.status,
        status_novo: 'DISPENSADA',
        ...contadores,
      },
      finalidade: 'dispensacao.dispensada',
    });

    const updated = await this.repo.findDispensacaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Dispensação dispensada não encontrada (RLS?).');
    }
    const updatedItens = await this.repo.findItensByDispensacaoId(
      disp.id,
      disp.data_hora,
    );
    const presented = presentDispensacao(updated, updatedItens);

    this.events.emit('dispensacao.dispensada', {
      tenantId: ctx.tenantId.toString(),
      dispensacao: presented,
    });

    return presented;
  }
}
