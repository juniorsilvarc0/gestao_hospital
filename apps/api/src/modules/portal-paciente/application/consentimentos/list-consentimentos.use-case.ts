/**
 * `GET /v1/portal/paciente/consentimentos` — lista todos os
 * consentimentos do paciente (aceitos, recusados, revogados).
 */
import { Injectable } from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { PortalConsentimentosListResponse } from '../../dto/responses';
import { presentConsentimento } from '../presenter';

@Injectable()
export class ListConsentimentosUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(): Promise<PortalConsentimentosListResponse> {
    const ctx = await this.resolver.resolve();
    const rows = await this.repo.listConsentimentosPaciente(ctx.pacienteId);
    return { data: rows.map(presentConsentimento) };
  }
}
