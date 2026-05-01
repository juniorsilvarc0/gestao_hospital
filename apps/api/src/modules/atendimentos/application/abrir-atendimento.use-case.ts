/**
 * `POST /v1/atendimentos` — abertura.
 *
 * Fluxo (RN-ATE-01..03):
 *   1. Resolve UUIDs (paciente, prestador, setor, unidades, agendamento,
 *      convênio, plano, procedimento principal).
 *   2. Valida que paciente tem CPF OU CNS (RN-ATE-01).
 *   3. Se `tipoCobranca = CONVENIO`:
 *        a. Resolve `paciente_convenio` (busca por carteirinha).
 *        b. Chama `ConvenioElegibilidadeService.verificar`. Resultado
 *           PENDENTE → grava observação `elegibilidade-manual`.
 *   4. Se procedimento principal exige autorização:
 *        a. Exige `senhaAutorizacao` OU `urgencia=true` com
 *           `urgenciaJustificativa` (RN-ATE-03).
 *   5. Gera `numero_atendimento` (sequence por tenant).
 *   6. INSERT atendimentos. Trigger `tg_atendimento_cria_conta`
 *      auto-cria conta + UPDATE de conta_id na linha.
 *   7. Audit `atendimento.iniciado`. Emit event no EventEmitter
 *      (Trilha B replicará em Redis Streams).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { AbrirAtendimentoDto } from '../dto/abrir-atendimento.dto';
import type { AtendimentoResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { ConvenioElegibilidadeService } from '../infrastructure/convenio-elegibilidade.service';
import { NumeroAtendimentoGenerator } from '../infrastructure/numero-atendimento.generator';
import { presentAtendimento } from './atendimento.presenter';

const PA_INITIAL_STATUSES_BY_TIPO: Record<string, string> = {
  PRONTO_ATENDIMENTO: 'EM_TRIAGEM',
};

@Injectable()
export class AbrirAtendimentoUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly numeroGen: NumeroAtendimentoGenerator,
    private readonly elegibilidade: ConvenioElegibilidadeService,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: AbrirAtendimentoDto): Promise<AtendimentoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AbrirAtendimentoUseCase requires a request context.');
    }

    // 1. Resolve paciente
    const paciente = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
    if (paciente === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    // 2. RN-ATE-01: CPF OU CNS obrigatório.
    if (paciente.cpfHash === null && paciente.cns === null) {
      throw new UnprocessableEntityException({
        code: 'PACIENTE_SEM_CPF_CNS',
        message:
          'Paciente sem CPF e sem CNS — RN-ATE-01 bloqueia abertura. Vincule à mãe ou regularize cadastro.',
      });
    }

    const prestadorId = await this.repo.findPrestadorIdByUuid(dto.prestadorUuid);
    if (prestadorId === null) {
      throw new NotFoundException({
        code: 'PRESTADOR_NOT_FOUND',
        message: 'Prestador não encontrado.',
      });
    }
    const setorId = await this.repo.findSetorIdByUuid(dto.setorUuid);
    if (setorId === null) {
      throw new NotFoundException({
        code: 'SETOR_NOT_FOUND',
        message: 'Setor não encontrado.',
      });
    }
    const unidadeFatId = await this.repo.findUnidadeFaturamentoIdByUuid(
      dto.unidadeFaturamentoUuid,
    );
    if (unidadeFatId === null) {
      throw new NotFoundException({
        code: 'UNIDADE_FATURAMENTO_NOT_FOUND',
        message: 'Unidade de faturamento não encontrada.',
      });
    }
    const unidadeAtendId = await this.repo.findUnidadeAtendimentoIdByUuid(
      dto.unidadeAtendimentoUuid,
    );
    if (unidadeAtendId === null) {
      throw new NotFoundException({
        code: 'UNIDADE_ATENDIMENTO_NOT_FOUND',
        message: 'Unidade de atendimento não encontrada.',
      });
    }

    // Convênio + plano + paciente_convenio.
    let convenioId: bigint | null = null;
    let planoId: bigint | null = null;
    let pacienteConvenioId: bigint | null = null;

    if (dto.tipoCobranca === 'CONVENIO') {
      if (dto.convenioUuid === undefined || dto.numeroCarteirinha === undefined) {
        throw new BadRequestException({
          code: 'CONVENIO_REQUIRED',
          message:
            'tipoCobranca=CONVENIO exige convenioUuid + numeroCarteirinha (CHECK ck_atendimentos_conv).',
        });
      }
      convenioId = await this.repo.findConvenioIdByUuid(dto.convenioUuid);
      if (convenioId === null) {
        throw new NotFoundException({
          code: 'CONVENIO_NOT_FOUND',
          message: 'Convênio não encontrado.',
        });
      }
      if (dto.planoUuid !== undefined) {
        planoId = await this.repo.findPlanoIdByUuid(dto.planoUuid);
        if (planoId === null) {
          throw new NotFoundException({
            code: 'PLANO_NOT_FOUND',
            message: 'Plano não encontrado.',
          });
        }
      }
      // Tenta resolver vínculo paciente×convênio×carteirinha.
      pacienteConvenioId = await this.repo.findPacienteConvenioId(
        paciente.id,
        convenioId,
        dto.numeroCarteirinha,
      );
      // Não fail: é aceitável criar atendimento sem o vínculo
      // pré-cadastrado (operadores criam o vínculo depois).
    }

    let agendamentoId: bigint | null = null;
    if (dto.agendamentoUuid !== undefined) {
      agendamentoId = await this.repo.findAgendamentoIdByUuid(
        dto.agendamentoUuid,
      );
      if (agendamentoId === null) {
        throw new NotFoundException({
          code: 'AGENDAMENTO_NOT_FOUND',
          message: 'Agendamento não encontrado.',
        });
      }
    }

    // RN-ATE-03: procedimento que exige autorização.
    let observacaoAutorizacao: string | null = null;
    if (dto.procedimentoUuid !== undefined) {
      const proc = await this.repo.findProcedimentoByUuid(dto.procedimentoUuid);
      if (proc === null) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: 'Procedimento não encontrado.',
        });
      }
      if (proc.precisa_autorizacao) {
        const temSenha =
          dto.senhaAutorizacao !== undefined &&
          dto.senhaAutorizacao.trim().length > 0;
        const urgenciaOk =
          dto.urgencia === true &&
          dto.urgenciaJustificativa !== undefined &&
          dto.urgenciaJustificativa.trim().length >= 5;
        if (!temSenha && !urgenciaOk) {
          throw new UnprocessableEntityException({
            code: 'AUTORIZACAO_REQUIRED',
            message:
              'Procedimento exige senhaAutorizacao ou flag urgencia=true com urgenciaJustificativa (RN-ATE-03).',
          });
        }
        if (urgenciaOk) {
          observacaoAutorizacao = `URGENCIA: ${dto.urgenciaJustificativa}`;
        }
      }
    }

    // RN-ATE-02: elegibilidade do convênio.
    let observacaoElegibilidade: string | null = null;
    if (dto.tipoCobranca === 'CONVENIO' && convenioId !== null) {
      const resultado = await this.elegibilidade.verificar({
        tenantId: ctx.tenantId,
        pacienteId: paciente.id,
        convenioId,
        pacienteConvenioId,
      });
      if (resultado.status === 'NEGADA') {
        throw new UnprocessableEntityException({
          code: 'CONVENIO_NEGADO',
          message: `Elegibilidade negada pelo convênio: ${resultado.mensagem ?? ''}`,
        });
      }
      if (resultado.status === 'PENDENTE') {
        observacaoElegibilidade = `elegibilidade-manual (${resultado.fonte}) ${new Date().toISOString()}`;
      }
    }

    const observacaoFinal = [
      dto.observacao ?? null,
      observacaoAutorizacao,
      observacaoElegibilidade,
    ]
      .filter((s): s is string => s !== null)
      .join('\n');

    const numero = await this.numeroGen.next(ctx.tenantId);
    const statusInicial =
      PA_INITIAL_STATUSES_BY_TIPO[dto.tipo] ?? 'EM_ESPERA';

    const inserted = await this.repo.insertAtendimento({
      tenantId: ctx.tenantId,
      numeroAtendimento: numero,
      pacienteId: paciente.id,
      prestadorId,
      setorId,
      unidadeFaturamentoId: unidadeFatId,
      unidadeAtendimentoId: unidadeAtendId,
      tipo: dto.tipo,
      tipoCobranca: dto.tipoCobranca,
      pacienteConvenioId,
      convenioId,
      planoId,
      numeroCarteirinha: dto.numeroCarteirinha ?? null,
      numeroGuiaOperadora: dto.numeroGuiaOperadora ?? null,
      senhaAutorizacao: dto.senhaAutorizacao ?? null,
      motivoAtendimento: dto.motivoAtendimento ?? null,
      cidPrincipal: dto.cidPrincipal ?? null,
      cidsSecundarios: dto.cidsSecundarios ?? null,
      agendamentoId,
      atendimentoOrigemId: null,
      observacao: observacaoFinal === '' ? null : observacaoFinal,
      statusInicial,
      createdBy: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'atendimento.iniciado',
        numero,
        tipo: dto.tipo,
        tipo_cobranca: dto.tipoCobranca,
        setor_id: setorId.toString(),
        prestador_id: prestadorId.toString(),
        paciente_id: paciente.id.toString(),
        ...(observacaoElegibilidade !== null
          ? { elegibilidade: 'PENDENTE' }
          : {}),
        ...(observacaoAutorizacao !== null ? { autorizacao: 'URGENCIA' } : {}),
      },
      finalidade: 'atendimento.iniciado',
    });

    // Outbox-light: publica via EventEmitter local (Trilha B amplia
    // para Redis Streams). Consumidores conhecidos:
    //   - elegibilidade-poller (Trilha B) usa para retry de WS.
    this.events.emit('atendimento.iniciado', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: inserted.id.toString(),
      atendimentoUuid: inserted.uuid_externo,
      tipo: dto.tipo,
      tipoCobranca: dto.tipoCobranca,
      pacienteId: paciente.id.toString(),
    });

    const created = await this.repo.findAtendimentoByUuid(inserted.uuid_externo);
    if (created === null) {
      throw new Error('Atendimento criado não encontrado (RLS?).');
    }
    return presentAtendimento(created);
  }
}
