/**
 * `GET /v1/portal/medico/repasses/{competencia}` — detalhe do repasse
 * de uma competência específica para o médico logado.
 *
 * 404 se não existe (`RepasseRepository.findRepassePorPrestadorCompetencia`
 * retorna null). Status `CANCELADO` ainda é visível para histórico.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RepasseRepository } from '../../repasse/infrastructure/repasse.repository';
import type { RepasseMedicoDetalheResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import {
  presentRepasseItemMedico,
  presentRepasseListItem,
} from './presenter';

const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class GetRepasseMedicoUseCase {
  constructor(private readonly repasseRepo: RepasseRepository) {}

  async execute(
    ctx: MedicoRequestContext,
    competencia: string,
  ): Promise<RepasseMedicoDetalheResponse> {
    if (!COMPETENCIA_RE.test(competencia)) {
      throw new NotFoundException({
        code: 'PORTAL_MEDICO_COMPETENCIA_INVALIDA',
        message: 'Competência deve ser AAAA-MM (ex.: 2026-04).',
      });
    }
    const row = await this.repasseRepo.findRepassePorPrestadorCompetencia(
      ctx.prestadorId,
      competencia,
    );
    if (row === null) {
      throw new NotFoundException({
        code: 'PORTAL_MEDICO_REPASSE_NOT_FOUND',
        message: `Sem repasse na competência ${competencia} para este médico.`,
      });
    }
    const itens = await this.repasseRepo.findRepasseItensByRepasseId(row.id);
    const base = presentRepasseListItem(row);

    return {
      repasse: {
        ...base,
        valorCreditos: row.valor_creditos,
        valorDebitos: row.valor_debitos,
        valorDescontos: row.valor_descontos,
        valorImpostos: row.valor_impostos,
        observacao: row.observacao,
      },
      itens: itens.map(presentRepasseItemMedico),
    };
  }
}
