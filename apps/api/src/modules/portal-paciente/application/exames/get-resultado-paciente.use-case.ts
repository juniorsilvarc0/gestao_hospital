/**
 * `GET /v1/portal/paciente/exames/{uuid}/resultado` — devolve laudo
 * estruturado + URLs.
 *
 * REGRA-PORTAL: paciente só lê resultado se `status = LAUDO_FINAL` ou
 * `LAUDO_PARCIAL` E o laudo está assinado. Em estados intermediários
 * (PENDENTE/COLETADO/EM_ANALISE) → 409 Conflict (RN-LAB-04 indica que
 * antes da assinatura o laudo não tem validade legal).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PacienteContextResolver } from '../../domain/paciente-context';
import { PortalPacienteRepository } from '../../infrastructure/portal-paciente.repository';
import type { PortalResultadoExameResponse } from '../../dto/responses';
import { presentResultado } from '../presenter';

const STATUS_PERMITIDOS = new Set(['LAUDO_FINAL', 'LAUDO_PARCIAL']);

@Injectable()
export class GetResultadoPacienteUseCase {
  constructor(
    private readonly resolver: PacienteContextResolver,
    private readonly repo: PortalPacienteRepository,
  ) {}

  async execute(resultadoUuid: string): Promise<PortalResultadoExameResponse> {
    const ctx = await this.resolver.resolve();
    const row = await this.repo.findResultadoPacienteByUuid(
      ctx.pacienteId,
      resultadoUuid,
    );
    if (row === null) {
      throw new NotFoundException({
        code: 'RESULTADO_NOT_FOUND',
        message: 'Resultado não encontrado para o paciente.',
      });
    }
    if (!STATUS_PERMITIDOS.has(row.status)) {
      throw new ConflictException({
        code: 'RESULTADO_NAO_LAUDADO',
        message:
          'Resultado ainda não foi laudado. Somente laudos parciais/finais são visíveis no portal.',
        statusAtual: row.status,
      });
    }
    if (row.assinado_em === null) {
      throw new ConflictException({
        code: 'RESULTADO_NAO_ASSINADO',
        message:
          'Laudo aguardando assinatura digital — sem validade legal até ser assinado.',
        statusAtual: row.status,
      });
    }
    return presentResultado(row);
  }
}
