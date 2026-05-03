/**
 * `GET /v1/portal/paciente/teleconsulta/{agendamentoUuid}/link` — devolve
 * a URL ativa de teleconsulta.
 *
 * Estratégia:
 *   - Valida que o agendamento pertence ao paciente logado;
 *   - Aplica a janela RN-AGE-05 (`[inicio - 30min, fim + 30min]`);
 *   - Devolve `link_teleconsulta` (provisionado pelo
 *     `DailyCoService` no `CreateAgendamentoUseCase`) + expiraEm.
 *
 * NOTA: existe um controller legado
 * `apps/api/src/modules/agendamento/teleconsulta.controller.ts` na
 * mesma rota. A duplicação ficou desde a Trilha A da Fase 4 com TODO
 * "Fase 11 endurece a checagem". Esta implementação ENDURECE — ver
 * `portal-paciente.module.ts` para a remoção do controller legado.
 */
import {
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { PortalTeleconsultaLinkResponse } from '../../dto/responses';

const PRE_INICIO_GRACE_MIN = 30;
const POS_FIM_GRACE_MIN = 30;

@Injectable()
export class GetLinkTeleconsultaUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(
    agendamentoUuid: string,
  ): Promise<PortalTeleconsultaLinkResponse> {
    const ctx = await this.resolver.resolve();
    const ag = await this.repo.findAgendamentoPacienteByUuid(
      ctx.pacienteId,
      agendamentoUuid,
    );
    if (ag === null) {
      throw new NotFoundException({
        code: 'AGENDAMENTO_NAO_ENCONTRADO',
        message: 'Agendamento não encontrado para o paciente.',
      });
    }
    if (ag.link_teleconsulta === null) {
      throw new NotFoundException({
        code: 'TELECONSULTA_NAO_PROVISIONADA',
        message: 'Agendamento não tem teleconsulta associada.',
      });
    }

    const agora = new Date();
    const aberturaEm = new Date(
      ag.inicio.getTime() - PRE_INICIO_GRACE_MIN * 60 * 1000,
    );
    const expiraEm = new Date(
      ag.fim.getTime() + POS_FIM_GRACE_MIN * 60 * 1000,
    );
    if (agora < aberturaEm || agora > expiraEm) {
      throw new GoneException({
        code: 'TELECONSULTA_FORA_DA_JANELA',
        message: 'Link de teleconsulta fora da janela de validade.',
        aberturaEm: aberturaEm.toISOString(),
        expiraEm: expiraEm.toISOString(),
      });
    }

    return {
      url: ag.link_teleconsulta,
      expiraEm: expiraEm.toISOString(),
    };
  }
}
