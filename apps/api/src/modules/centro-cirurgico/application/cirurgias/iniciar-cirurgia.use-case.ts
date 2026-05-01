/**
 * `POST /v1/cirurgias/{uuid}/iniciar` — CONFIRMADA → EM_ANDAMENTO
 * (RN-CC-05).
 *
 * Pré-requisito operacional: `pacienteEmSala === true`. Sem essa flag o
 * use case retorna 422 (paciente fora de sala não pode iniciar).
 *
 * `data_hora_inicio` recebe o instante atual (ou o override do DTO).
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
import { nextCirurgiaStatus } from '../../domain/cirurgia';
import type { IniciarCirurgiaDto } from '../../dto/iniciar-cirurgia.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

@Injectable()
export class IniciarCirurgiaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: IniciarCirurgiaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('IniciarCirurgiaUseCase requires a request context.');
    }

    if (dto.pacienteEmSala !== true) {
      throw new UnprocessableEntityException({
        code: 'CIRURGIA_PACIENTE_FORA_SALA',
        message:
          'Início de cirurgia exige confirmação de pacienteEmSala=true (RN-CC-05).',
      });
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    const novo = nextCirurgiaStatus(cir.status, 'iniciar');
    if (novo === null) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não pode ser iniciada.`,
      });
    }

    const inicio = dto.dataHoraInicio ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(inicio))) {
      throw new UnprocessableEntityException({
        code: 'CIRURGIA_DATAHORA_INICIO_INVALIDA',
        message: 'dataHoraInicio inválida.',
      });
    }

    await this.repo.updateCirurgiaInicio(cir.id, inicio);

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.iniciada',
        status_anterior: cir.status,
        status_novo: 'EM_ANDAMENTO',
        paciente_em_sala: true,
      },
      finalidade: 'cirurgia.iniciada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia iniciada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.iniciada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
