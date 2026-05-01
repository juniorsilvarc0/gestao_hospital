/**
 * `GET /v1/atendimentos/:uuid/timeline` — placeholder Fase 6 (PEP).
 *
 * Fase 5 entrega apenas o esqueleto: header com dados básicos do
 * atendimento + lista de triagens. Fase 6 expande com evoluções,
 * prescrições, exames, sinais vitais, dispensações.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { AtendimentoRepository } from '../infrastructure/atendimento.repository';
import {
  presentAtendimento,
  presentTriagem,
} from './atendimento.presenter';
import type {
  AtendimentoResponse,
  TriagemResponse,
} from '../dto/atendimento.response';

export interface TimelineResponse {
  atendimento: AtendimentoResponse;
  eventos: Array<
    | { tipo: 'TRIAGEM'; em: string; payload: TriagemResponse }
    | { tipo: 'PLACEHOLDER'; em: string; descricao: string }
  >;
}

@Injectable()
export class GetTimelineUseCase {
  constructor(private readonly repo: AtendimentoRepository) {}

  async execute(uuid: string): Promise<TimelineResponse> {
    const atend = await this.repo.findAtendimentoByUuid(uuid);
    if (atend === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    const { data: triagens } = await this.repo.listTriagens(1, 50, atend.id);
    const eventos: TimelineResponse['eventos'] = triagens.map((t) => ({
      tipo: 'TRIAGEM' as const,
      em: t.triagem_em.toISOString(),
      payload: presentTriagem(t),
    }));
    eventos.push({
      tipo: 'PLACEHOLDER',
      em: atend.created_at.toISOString(),
      descricao:
        'Timeline completa (evoluções, prescrições, exames) virá na Fase 6 (PEP).',
    });
    return { atendimento: presentAtendimento(atend), eventos };
  }
}
