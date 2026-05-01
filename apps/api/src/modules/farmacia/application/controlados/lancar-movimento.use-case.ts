/**
 * `POST /v1/farmacia/livro-controlados/movimento` — lança movimento
 * manual no livro de controlados (Portaria 344/SVS-MS).
 *
 * Validação adicional além da trigger (RN-FAR-05):
 *   - Calculamos o saldo final aqui no app para retornar 422 com payload
 *     legível em vez do `RAISE EXCEPTION` da trigger virar 500.
 *   - Para `AJUSTE` o caller informa `saldoAtualAjuste`; nos demais
 *     calculamos pelo sinal do tipo.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { calcularSaldo } from '../../domain/livro-controlados';
import type { CreateMovimentoControladoDto } from '../../dto/movimento-controlado.dto';
import { FarmaciaRepository } from '../../infrastructure/farmacia.repository';

@Injectable()
export class LancarMovimentoUseCase {
  constructor(
    private readonly repo: FarmaciaRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateMovimentoControladoDto): Promise<{
    uuid: string;
    saldoAnterior: string;
    saldoAtual: string;
  }> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('LancarMovimentoUseCase requires request context.');
    }

    const procs = await this.repo.findProcedimentosByUuids([
      dto.procedimentoUuid,
    ]);
    const proc = procs.get(dto.procedimentoUuid);
    if (proc === undefined) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento não encontrado.',
      });
    }
    if (!proc.controlado) {
      throw new UnprocessableEntityException({
        code: 'PROCEDIMENTO_NAO_CONTROLADO',
        message:
          'Procedimento não é classificado como controlado — não pode ir ao livro.',
      });
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

    let pacienteId: bigint | null = null;
    if (dto.pacienteUuid !== undefined) {
      pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
      if (pacienteId === null) {
        throw new NotFoundException({
          code: 'PACIENTE_NOT_FOUND',
          message: 'Paciente não encontrado.',
        });
      }
    }

    const saldoCurr = await this.repo.findSaldoAtual(proc.id, dto.lote);
    const saldoAnteriorStr = saldoCurr?.saldoAtual ?? '0';

    const saldoAtualAjusteStr =
      dto.tipoMovimento === 'AJUSTE' && dto.saldoAtualAjuste !== undefined
        ? String(dto.saldoAtualAjuste)
        : undefined;

    if (
      dto.tipoMovimento === 'AJUSTE' &&
      saldoAtualAjusteStr === undefined
    ) {
      throw new UnprocessableEntityException({
        code: 'AJUSTE_SALDO_REQUERIDO',
        message: 'AJUSTE exige saldoAtualAjuste explícito.',
      });
    }

    const calc = calcularSaldo(
      saldoAnteriorStr,
      String(dto.quantidade),
      dto.tipoMovimento,
      saldoAtualAjusteStr,
    );

    if (calc.saldoNegativo) {
      throw new UnprocessableEntityException({
        code: 'CONTROLADO_SALDO_NEGATIVO',
        message: `Saldo final ficaria negativo (${calc.saldoAtual}) — operação rejeitada (RN-FAR-05).`,
        detalhes: {
          saldoAtual: saldoAnteriorStr,
          quantidade: dto.quantidade,
          tipoMovimento: dto.tipoMovimento,
        },
      });
    }

    const inserted = await this.repo.insertMovimentoControlado({
      tenantId: ctx.tenantId,
      procedimentoId: proc.id,
      lote: dto.lote,
      quantidade: String(dto.quantidade),
      saldoAnterior: calc.saldoAnterior,
      saldoAtual: calc.saldoAtual,
      tipoMovimento: dto.tipoMovimento,
      pacienteId,
      prescricaoId: null,
      prescricaoDataHora: null,
      dispensacaoItemId: null,
      receitaDocumentoUrl: dto.receitaDocumentoUrl ?? null,
      farmaceuticoId,
      observacao: dto.observacao ?? null,
    });

    await this.auditoria.record({
      tabela: 'livro_controlados',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'controlado.movimento.lancado',
        procedimento_id: proc.id.toString(),
        lote: dto.lote,
        tipo: dto.tipoMovimento,
        quantidade: String(dto.quantidade),
        saldo_anterior: calc.saldoAnterior,
        saldo_atual: calc.saldoAtual,
      },
      finalidade: 'controlado.movimento',
    });

    return {
      uuid: inserted.uuidExterno,
      saldoAnterior: calc.saldoAnterior,
      saldoAtual: calc.saldoAtual,
    };
  }
}
