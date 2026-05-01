/**
 * `POST /v1/cirurgias/{uuid}/ficha-cirurgica` — RN-CC-04.
 *
 * Ficha cirúrgica é um JSONB livre (a UI/IA define a estrutura). Aqui
 * apenas validamos que veio um objeto não-vazio e armazenamos.
 *
 * Permitida em CONFIRMADA / EM_ANDAMENTO / CONCLUIDA — pode ser
 * preenchida durante a cirurgia e ajustada após (até a fatura ser
 * fechada — controle externo a este endpoint).
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
import type { FichaCirurgicaDto } from '../../dto/ficha.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentCirurgia } from './cirurgia.presenter';

const STATUSES_PERMITIDOS = new Set([
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
]);

@Injectable()
export class FichaCirurgicaUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: FichaCirurgicaDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('FichaCirurgicaUseCase requires a request context.');
    }

    if (
      dto.ficha === null ||
      typeof dto.ficha !== 'object' ||
      Object.keys(dto.ficha).length === 0
    ) {
      throw new BadRequestException({
        code: 'FICHA_VAZIA',
        message: 'Ficha cirúrgica vazia.',
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
        message: `Cirurgia em status ${cir.status} não aceita ficha cirúrgica.`,
      });
    }

    await this.repo.updateCirurgiaFichaCirurgica({
      cirurgiaId: cir.id,
      ficha: dto.ficha,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.ficha_cirurgica.preenchida',
        n_campos: Object.keys(dto.ficha).length,
      },
      finalidade: 'cirurgia.ficha_cirurgica',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.ficha_cirurgica.preenchida', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
