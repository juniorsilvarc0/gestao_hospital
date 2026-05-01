/**
 * `POST /v1/atendimentos/:uuid/triagem` — Manchester (RN-ATE-04).
 *
 * Fluxo:
 *   1. Valida que atendimento existe e não está em estado terminal
 *      (ALTA/CANCELADO/NAO_COMPARECEU).
 *   2. Valida sinais vitais fisiológicos. Fora da faixa →
 *      `valorFisiologicoFora` 422 a menos que
 *      `confirmadoPeloProfissional = true`.
 *   3. INSERT triagem (audit cobre via tg_audit).
 *   4. UPDATE atendimentos: `classificacao_risco`, `_em`, `_por`,
 *      status muda para `EM_ATENDIMENTO` se estava em `EM_ESPERA`/
 *      `EM_TRIAGEM`. Mantém status caso já avançado.
 *   5. Audit `atendimento.triagem.classificada`. Emit event.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { TriagemDto } from '../dto/triagem.dto';
import type { TriagemResponse } from '../dto/atendimento.response';
import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import { presentTriagem } from './atendimento.presenter';
import { validarSinaisVitais } from './sinais-vitais.validator';

const TERMINAL_STATUSES = new Set([
  'ALTA',
  'CANCELADO',
  'NAO_COMPARECEU',
]);

@Injectable()
export class RegistrarTriagemUseCase {
  constructor(
    private readonly repo: AtendimentoRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: TriagemDto,
  ): Promise<TriagemResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RegistrarTriagemUseCase requires a request context.');
    }

    const atendimento = await this.repo.findAtendimentoByUuid(atendimentoUuid);
    if (atendimento === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (TERMINAL_STATUSES.has(atendimento.status)) {
      throw new ConflictException({
        code: 'ATENDIMENTO_ESTADO_TERMINAL',
        message: `Triagem não pode ser registrada em status ${atendimento.status}.`,
      });
    }

    const fora = validarSinaisVitais({
      paSistolica: dto.paSistolica,
      paDiastolica: dto.paDiastolica,
      fc: dto.fc,
      fr: dto.fr,
      temperatura: dto.temperatura,
      satO2: dto.satO2,
      glicemia: dto.glicemia,
      dorEva: dto.dorEva,
    });
    if (fora.length > 0 && dto.confirmadoPeloProfissional !== true) {
      throw new UnprocessableEntityException({
        code: 'SINAIS_VITAIS_FORA_FAIXA',
        message:
          'Um ou mais sinais vitais estão fora da faixa fisiológica. Reenvie com confirmadoPeloProfissional=true para sobrescrever.',
        details: { valorFisiologicoFora: fora },
      });
    }

    const inserted = await this.repo.insertTriagem({
      tenantId: ctx.tenantId,
      atendimentoId: atendimento.id,
      classificacao: dto.classificacao,
      queixaPrincipal: dto.queixaPrincipal,
      paSistolica: dto.paSistolica ?? null,
      paDiastolica: dto.paDiastolica ?? null,
      fc: dto.fc ?? null,
      fr: dto.fr ?? null,
      temperatura: dto.temperatura ?? null,
      satO2: dto.satO2 ?? null,
      glicemia: dto.glicemia ?? null,
      pesoKg: dto.pesoKg ?? null,
      alturaCm: dto.alturaCm ?? null,
      dorEva: dto.dorEva ?? null,
      observacao: dto.observacao ?? null,
      triagemPor: ctx.userId,
    });

    await this.repo.updateClassificacaoRisco(
      atendimento.id,
      dto.classificacao,
      ctx.userId,
    );

    await this.auditoria.record({
      tabela: 'atendimentos',
      registroId: atendimento.id,
      operacao: 'U',
      diff: {
        evento: 'atendimento.triagem.classificada',
        triagem_uuid: inserted.uuid_externo,
        classificacao: dto.classificacao,
        ...(fora.length > 0 ? { override_fisiologico: true } : {}),
      },
      finalidade: 'atendimento.triagem.classificada',
    });

    this.events.emit('atendimento.triagem.classificada', {
      tenantId: ctx.tenantId.toString(),
      atendimentoId: atendimento.id.toString(),
      atendimentoUuid: atendimento.uuid_externo,
      classificacao: dto.classificacao,
    });

    const triagem = await this.repo.findTriagemByUuid(inserted.uuid_externo);
    if (triagem === null) {
      throw new Error('Triagem criada não encontrada (RLS?).');
    }
    return presentTriagem(triagem);
  }
}
