/**
 * `GET /v1/portal/paciente/me` — dados básicos do paciente logado +
 * flags do dashboard (consentimentos pendentes, próximas consultas,
 * exames novos, notificações não lidas).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { MePacienteResponse } from '../../dto/responses';

@Injectable()
export class GetMePacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(): Promise<MePacienteResponse> {
    const ctx = await this.resolver.resolve();
    const paciente = await this.repo.findPacienteBasicById(ctx.pacienteId);
    if (paciente === null) {
      throw new NotFoundException({
        code: 'PACIENTE_NOT_FOUND',
        message: 'Paciente vinculado ao usuário não encontrado.',
      });
    }

    const [pendentes, proximas, exames, naoLidas] = await Promise.all([
      this.repo.countConsentimentosPendentes(ctx.pacienteId),
      this.repo.countProximosAgendamentos(ctx.pacienteId),
      this.repo.countExamesNovos(ctx.pacienteId),
      this.repo.countNotificacoesNaoLidas(ctx.pacienteId),
    ]);

    return {
      paciente: {
        uuid: paciente.uuid_externo,
        nome: paciente.nome,
        dataNascimento:
          paciente.data_nascimento !== null
            ? paciente.data_nascimento.toISOString().slice(0, 10)
            : null,
        sexo: paciente.sexo,
      },
      flags: {
        consentimentosPendentes: pendentes,
        proximasConsultasCount: proximas,
        examesNovosCount: exames,
        notificacoesNaoLidasCount: naoLidas,
      },
    };
  }
}
