/**
 * `POST /v1/cirurgias/{uuid}/ficha-anestesica` — RN-CC-04. Idêntico ao
 * `FichaCirurgicaUseCase`, exceto que grava no campo
 * `ficha_anestesica`.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { FichaAnestesicaDto } from '../../dto/ficha.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

const STATUSES_PERMITIDOS = new Set([
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
]);

@Injectable()
export class FichaAnestesicaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: FichaAnestesicaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('FichaAnestesicaUseCase requires a request context.');
    }

    if (
      dto.ficha === null ||
      typeof dto.ficha !== 'object' ||
      Object.keys(dto.ficha).length === 0
    ) {
      throw new BadRequestException({
        code: 'FICHA_VAZIA',
        message: 'Ficha anestésica vazia.',
      });
    }

    const cir = await this.repo.findCirurgiaByUuid(uuid);
    if (cir === null) {
      throw new NotFoundException({
        code: 'CIRURGIA_NOT_FOUND',
        message: 'Cirurgia não encontrada.',
      });
    }
    if (!STATUSES_PERMITIDOS.has(cir.status)) {
      throw new ConflictException({
        code: 'CIRURGIA_STATUS_INVALIDO',
        message: `Cirurgia em status ${cir.status} não aceita ficha anestésica.`,
      });
    }

    await this.repo.updateCirurgiaFichaAnestesica({
      cirurgiaId: cir.id,
      ficha: dto.ficha,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.ficha_anestesica.preenchida',
        n_campos: Object.keys(dto.ficha).length,
      },
      finalidade: 'cirurgia.ficha_anestesica',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.ficha_anestesica.preenchida', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
