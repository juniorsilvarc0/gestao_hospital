/**
 * `GET /v1/portal/paciente/contas/{uuid}/espelho` — espelho de conta.
 *
 * Reaproveita `GerarEspelhoUseCase` do `ContasModule` (Fase 8 R-A).
 * A camada-portal valida que a conta pertence ao paciente do request
 * antes de delegar — evita vazamento de dados entre pacientes.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { GerarEspelhoUseCase } from '../../../contas/application/contas/gerar-espelho.use-case';
import type { EspelhoResponse } from '../../../contas/dto/responses';
import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';

@Injectable()
export class GetEspelhoPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
    private readonly gerarEspelhoUC: GerarEspelhoUseCase,
  ) {}

  async execute(contaUuid: string): Promise<EspelhoResponse> {
    const ctx = await this.resolver.resolve();
    const conta = await this.repo.findContaPacienteByUuid(
      ctx.pacienteId,
      contaUuid,
    );
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada para o paciente.',
      });
    }
    return this.gerarEspelhoUC.execute(contaUuid);
  }
}
