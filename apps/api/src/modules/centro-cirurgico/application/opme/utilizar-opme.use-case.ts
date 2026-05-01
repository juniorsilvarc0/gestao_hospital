/**
 * `POST /v1/cirurgias/{uuid}/opme/utilizar` — fase 3 do fluxo OPME
 * (RN-CC-03).
 *
 * Pré-requisito:
 *   - Existir `opme_autorizada` com >= 1 item, OU
 *   - Cirurgia EMERGENCIA com `motivoUrgencia` em CADA item informado.
 *
 * Os itens utilizados ficam em `opme_utilizada` (JSONB) e são
 * convertidos em `contas_itens` no encerramento (RN-CC-06).
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
  podeUtilizarSemAutorizacao,
  type OpmeItem,
} from '../../domain/opme';
import type { OpmeUtilizarDto } from '../../dto/opme.dto';
import type { CirurgiaResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import {
  presentCirurgia,
  unpackOpme,
} from '../cirurgias/cirurgia.presenter';

const STATUSES_PERMITIDOS = new Set([
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
]);

@Injectable()
export class UtilizarOpmeUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    uuid: string,
    dto: OpmeUtilizarDto,
  ): Promise<CirurgiaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UtilizarOpmeUseCase requires a request context.');
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
        message: `Cirurgia em status ${cir.status} não aceita utilização OPME.`,
      });
    }

    const itens: OpmeItem[] = dto.itens.map((it) => ({
      procedimentoUuid: it.procedimentoUuid ?? null,
      descricao: it.descricao,
      quantidade: it.quantidade,
      fabricante: it.fabricante ?? null,
      registroAnvisa: it.registroAnvisa ?? null,
      lote: it.lote ?? null,
      motivoUrgencia: it.motivoUrgencia ?? null,
    }));

    const autorizada = unpackOpme(cir.opme_autorizada);
    const check = podeUtilizarSemAutorizacao({
      classificacao: cir.classificacao_cirurgia,
      autorizadaTemRegistros: autorizada.length > 0,
      itens,
    });
    if (!check.ok) {
      throw new UnprocessableEntityException({
        code: check.motivo ?? 'OPME_PRE_REQUISITO',
        message:
          check.motivo === 'OPME_AUTORIZACAO_REQUIRED'
            ? 'OPME só pode ser utilizado após autorização (RN-CC-03).'
            : 'Cirurgia EMERGENCIAL exige motivoUrgencia em cada item de OPME utilizado.',
      });
    }

    await this.repo.updateOpme({
      cirurgiaId: cir.id,
      fase: 'utilizada',
      itens,
    });

    await this.auditoria.record({
      tabela: 'cirurgias',
      registroId: cir.id,
      operacao: 'U',
      diff: {
        evento: 'cirurgia.opme.utilizada',
        n_itens: itens.length,
        com_autorizacao: autorizada.length > 0,
      },
      finalidade: 'cirurgia.opme.utilizada',
    });

    const updated = await this.repo.findCirurgiaByUuid(uuid);
    if (updated === null) {
      throw new Error('Cirurgia atualizada não encontrada (RLS?).');
    }
    const equipe = await this.repo.findEquipeByCirurgiaId(cir.id);
    const presented = presentCirurgia(updated, equipe);

    this.events.emit('cirurgia.opme.utilizada', {
      tenantId: ctx.tenantId.toString(),
      cirurgia: presented,
    });

    return presented;
  }
}
