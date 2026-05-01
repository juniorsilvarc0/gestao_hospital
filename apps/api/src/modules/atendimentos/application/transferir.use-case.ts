/**
 * `POST /v1/atendimentos/:uuid/transferir` (RN-ATE-08).
 *
 * Dois caminhos:
 *
 * **Interna** (`externo: false` — default):
 *   - Mantém o mesmo atendimento.
 *   - Libera leito atual (status='HIGIENIZACAO').
 *   - Aloca leito novo via `LeitoAllocator.alocar` (mesma máquina de
 *     estado da internação).
 *   - Atualiza atendimento.leito_id.
 *   - Audit `atendimento.transferido.interno`.
 *
 * **Externa** (`externo: true`):
 *   - Cria NOVO atendimento com `atendimento_origem_id` apontando o
 *     atual (RN-ATE-08).
 *   - Marca atual com status='ALTA', tipo_alta='TRANSFERENCIA',
 *     libera leito (HIGIENIZACAO).
 *   - Audit `atendimento.transferido.externo`.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { TransferirDto } from '../dto/transferir.dto';
import type { AtendimentoResponse } from '../dto/atendimento.response';
import {
  AtendimentoRepository,
  type AtendimentoRow,
} from '../infrastructure/atendimento.repository';
import { LeitoAllocator } from '../infrastructure/leito-allocator';
import { NumeroAtendimentoGenerator } from '../infrastructure/numero-atendimento.generator';
import { presentAtendimento } from './atendimento.presenter';

@Injectable()
export class TransferirUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly allocator: LeitoAllocator,
    private readonly numeroGen: NumeroAtendimentoGenerator,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: TransferirDto,
  ): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('TransferirUseCase requires a request context.');
    }

    const externo = dto.externo === true;

    const atend = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (atend.status === 'ALTA' || atend.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Não é possível transferir atendimento em status ${atend.status}.`,
      });
    }

    if (externo) {
      return this.executarExterna(atendimentoUuid, atend, dto);
    }

    if (dto.leitoUuid === undefined || dto.leitoVersao === undefined) {
      throw new BadRequestException({
        code: 'TRANSFERENCIA_INTERNA_LEITO_REQUIRED',
        message: 'Transferência interna exige leitoUuid + leitoVersao.',
      });
    }
    if (atend.leito_id === null) {
      throw new ConflictException({
        code: 'ATENDIMENTO_SEM_LEITO',
        message:
          'Transferência interna exige leito atual alocado (use internar para alocar pela primeira vez).',
      });
    }

    // 1. Aloca leito novo (atomicidade do allocator garante).
    const alocacao = await this.allocator.alocar({
      leitoUuid: dto.leitoUuid,
      leitoVersao: dto.leitoVersao,
      atendimentoId: atend.id,
      pacienteId: atend.paciente_id,
    });

    // 2. Libera leito anterior (HIGIENIZACAO). Se falhar, transação
    // rollba e o allocator rollbackará a alocação nova também.
    const liberacao = await this.allocator.liberar({
      leitoId: atend.leito_id,
    });

    // 3. Atualiza atendimento.leito_id (mantém status INTERNADO).
    await this.repo.setLeitoNoAtendimento(
      atend.id,
      alocacao.leitoId,
      ctx.userId,
    );

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.transferido.interno',
        leito_anterior_id: atend.leito_id?.toString(),
        leito_novo_id: alocacao.leitoId.toString(),
        leito_novo_uuid: dto.leitoUuid,
        motivo: dto.motivo,
      },
      finalidade: 'atendimento.transferido.interno',
    });

    this.events.emit('leito.liberado', {
      tenantId: ctx.tenantId.toString(),
      leitoId: atend.leito_id.toString(),
      novaVersao: liberacao.novaVersao,
    });
    this.events.emit('leito.alocado', {
      tenantId: ctx.tenantId.toString(),
      leitoId: alocacao.leitoId.toString(),
      leitoUuid: dto.leitoUuid,
      atendimentoId: atend.id.toString(),
      atendimentoUuid,
      pacienteId: atend.paciente_id.toString(),
      novaVersao: alocacao.novaVersao,
    });
    this.events.emit('atendimento.transferido', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atend.id.toString(),
      tipo: 'INTERNA',
    });

    const updated = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (updated === null) {
      throw new Error('Atendimento atualizado não encontrado.');
    }
    return presentAtendimento(updated);
  }

  private async executarExterna(
    atendimentoUuid: string,
    atend: AtendimentoRow,
    dto: TransferirDto,
  ): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('TransferirUseCase requires a request context.');
    }
    // 1. Cria novo atendimento (origem = atual). Reusa snapshot dos
    // metadados de cobrança do atendimento atual — operador edita
    // depois se quiser.
    const numero = await this.numeroGen.next(ctx.tenantId);
    const inserted = await this.repo.insertAtendimento({
      tenantId: ctx.tenantId,
      numeroAtendimento: numero,
      pacienteId: atend.paciente_id,
      prestadorId: atend.prestador_id,
      setorId: atend.setor_id,
      unidadeFaturamentoId: atend.unidade_faturamento_id,
      unidadeAtendimentoId: atend.unidade_atendimento_id,
      tipo: atend.tipo,
      tipoCobranca: atend.tipo_cobranca,
      pacienteConvenioId: null,
      convenioId: atend.convenio_id,
      planoId: atend.plano_id,
      numeroCarteirinha: atend.numero_carteirinha,
      numeroGuiaOperadora: null,
      senhaAutorizacao: null,
      motivoAtendimento: `Transferência externa de ${atendimentoUuid}: ${dto.motivo}`,
      cidPrincipal: null,
      cidsSecundarios: null,
      agendamentoId: null,
      atendimentoOrigemId: atend.id,
      observacao:
        dto.destinoExterno !== undefined
          ? `DESTINO: ${dto.destinoExterno}`
          : null,
      statusInicial: 'EM_ESPERA',
      createdBy: ctx.userId,
    });

    // 2. Atual: ALTA tipo_alta=TRANSFERENCIA + liberação de leito.
    await this.repo.darAlta(
      atend.id,
      'TRANSFERENCIA',
      null,
      `Transferência externa: ${dto.motivo}`,
      ctx.userId,
    );
    if (atend.leito_id !== null) {
      const liberacao = await this.allocator.liberar({
        leitoId: atend.leito_id,
      });
      this.events.emit('leito.liberado', {
        tenantId: ctx.tenantId.toString(),
        leitoId: atend.leito_id.toString(),
        novaVersao: liberacao.novaVersao,
      });
    }

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atend.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.transferido.externo',
        novo_atendimento_id: inserted.id.toString(),
        novo_atendimento_uuid: inserted.uuid_externo,
        motivo: dto.motivo,
        destino: dto.destinoExterno ?? null,
      },
      finalidade: 'atendimento.transferido.externo',
    });

    this.events.emit('atendimento.transferido', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atend.id.toString(),
      novoAtendimentoId: inserted.id.toString(),
      novoAtendimentoUuid: inserted.uuid_externo,
      tipo: 'EXTERNA',
    });

    const novo = await this.repo.findAtendimentoByUuid(inserted.uuid_externo);
    if (novo === null) {
      throw new Error('Novo atendimento não encontrado após transferência externa.');
    }
    return presentAtendimento(novo);
  }
}
