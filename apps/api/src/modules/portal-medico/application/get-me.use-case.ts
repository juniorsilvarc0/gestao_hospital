/**
 * `GET /v1/portal/medico/me` — perfil + resumo do médico logado.
 *
 * Compõe:
 *   - Dados do prestador (uuid, nome, conselho, CBO).
 *   - Permissões efetivas do usuário (lista de "recurso:acao").
 *   - Resumo:
 *       - próxima consulta (se houver),
 *       - laudos pendentes (count),
 *       - cirurgias hoje (count),
 *       - resumo do último repasse (se houver).
 *
 * `MedicoOnlyGuard` já garantiu o vínculo usuario→prestador antes do
 * use case rodar — usamos o `MedicoRequestContext` montado no request.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RepasseRepository } from '../../repasse/infrastructure/repasse.repository';
import { todayRange } from '../domain/medico-context';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';
import type { MedicoMeResponse } from '../dto/responses';
import {
  presentPrestador,
  presentProximaConsulta,
  presentRepasseResumo,
} from './presenter';

@Injectable()
export class GetMeUseCase {
  constructor(
    private readonly repo: PortalMedicoRepository,
    private readonly repasseRepo: RepasseRepository,
  ) {}

  async execute(ctx: MedicoRequestContext): Promise<MedicoMeResponse> {
    const prestador = await this.repo.findPrestadorById(ctx.prestadorId);
    if (prestador === null) {
      throw new NotFoundException({
        code: 'PORTAL_MEDICO_PRESTADOR_NOT_FOUND',
        message: 'Prestador vinculado ao usuário não foi encontrado.',
      });
    }

    const permissoes = await this.repo.findPermissoesByUsuarioId(ctx.userId);

    const now = new Date();
    const { inicio, fim } = todayRange(now);

    const [proximaRow, laudosPendentes, cirurgiasHoje, ultimoRepasse] =
      await Promise.all([
        this.repo.findProximaConsulta(ctx.prestadorId, now.toISOString()),
        this.repo.countLaudosPendentes(ctx.prestadorId),
        this.repo.countCirurgiasRange({
          prestadorId: ctx.prestadorId,
          inicio,
          fim,
        }),
        this.repasseRepo.listRepasses({
          prestadorId: ctx.prestadorId,
          page: 1,
          pageSize: 1,
        }),
      ]);

    return {
      prestador: presentPrestador(prestador),
      permissoes,
      resumo: {
        proximaConsulta:
          proximaRow === null ? null : presentProximaConsulta(proximaRow),
        laudosPendentes,
        cirurgiasHoje,
        repasseUltimaCompetencia:
          ultimoRepasse.rows.length === 0
            ? null
            : presentRepasseResumo(ultimoRepasse.rows[0]),
      },
    };
  }
}
