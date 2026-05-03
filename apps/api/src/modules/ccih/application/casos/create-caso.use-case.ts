/**
 * `POST /v1/ccih/casos` — registra novo caso de IRAS.
 *
 * Caso nasce em status `ABERTO`. Resistência (antibiograma) é validada
 * pelo schema do DTO + helper de domínio.
 *
 * Emite evento `ccih.caso_registrado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import {
  normalizeAntibiograma,
  validateAntibiograma,
} from '../../domain/antibiograma';
import type { CreateCasoCcihDto } from '../../dto/create-caso.dto';
import type { CasoCcihResponse } from '../../dto/responses';
import { CcihRepository } from '../../infrastructure/ccih.repository';
import { presentCaso } from './caso.presenter';

@Injectable()
export class CreateCasoUseCase {
  constructor(
    private readonly repo: CcihRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: CreateCasoCcihDto): Promise<CasoCcihResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateCasoUseCase requires request context.');
    }

    const pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid);
    if (pacienteId === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      });
    }

    const atendimento = await this.repo.findAtendimentoByUuid(
      dto.atendimentoUuid,
    );
    if (atendimento === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (atendimento.pacienteId !== pacienteId) {
      throw new UnprocessableEntityException({
        code: 'ATENDIMENTO_PACIENTE_MISMATCH',
        message: 'Atendimento informado não pertence ao paciente.',
      });
    }

    const setorId = await this.repo.findSetorIdByUuid(dto.setorUuid);
    if (setorId === null) {
      throw new NotFoundException({
        code: 'SETOR_NOT_FOUND',
        message: 'Setor não encontrado.',
      });
    }

    let leitoId: bigint | null = null;
    if (dto.leitoUuid !== undefined) {
      const id = await this.repo.findLeitoIdByUuid(dto.leitoUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'LEITO_NOT_FOUND',
          message: 'Leito não encontrado.',
        });
      }
      leitoId = id;
    }

    // Validação extra do antibiograma (já validado pelo DTO mas defensivo).
    if (dto.resistencia !== undefined) {
      const erro = validateAntibiograma(dto.resistencia);
      if (erro !== null) {
        throw new UnprocessableEntityException({
          code: 'ANTIBIOGRAMA_INVALIDO',
          message: erro,
        });
      }
    }
    const resistencia = normalizeAntibiograma(dto.resistencia ?? null);

    const inserted = await this.repo.insertCaso({
      tenantId: ctx.tenantId,
      pacienteId,
      atendimentoId: atendimento.id,
      setorId,
      leitoId,
      dataDiagnostico: dto.dataDiagnostico,
      topografia: dto.topografia ?? null,
      cid: dto.cid ?? null,
      microorganismo: dto.microorganismo ?? null,
      culturaOrigem: dto.culturaOrigem ?? null,
      resistencia,
      origemInfeccao: dto.origemInfeccao,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'ccih_casos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'ccih.caso_registrado',
        paciente_id: pacienteId.toString(),
        setor_id: setorId.toString(),
        data_diagnostico: dto.dataDiagnostico,
        cid: dto.cid ?? null,
        microorganismo: dto.microorganismo ?? null,
        origem_infeccao: dto.origemInfeccao,
      },
      finalidade: 'ccih.caso_registrado',
    });

    this.events.emit('ccih.caso_registrado', {
      casoUuid: inserted.uuidExterno,
      pacienteUuid: dto.pacienteUuid,
      origem: dto.origemInfeccao,
    });

    const row = await this.repo.findCasoByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Caso CCIH criado não encontrado (RLS?).');
    }
    return presentCaso(row);
  }
}
