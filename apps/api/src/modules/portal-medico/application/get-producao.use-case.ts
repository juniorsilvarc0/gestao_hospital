/**
 * `GET /v1/portal/medico/producao?competencia=YYYY-MM` — agregados de
 * produção do médico na competência. Combina:
 *   - Totais brutos (atendimentos / cirurgias / laudos).
 *   - `porTipo` agregado por `grupo_gasto` em `contas_itens` da
 *     competência (visão financeira).
 *   - `porFuncao` agregado por `funcao` em `repasses_itens` (visão de
 *     papel cirúrgico — só preenche quando há repasse apurado).
 *
 * Default: competência atual.
 */
import { Injectable } from '@nestjs/common';

import { currentCompetencia } from '../domain/medico-context';
import type { ProducaoQueryDto } from '../dto/producao-query.dto';
import type { ProducaoResponse } from '../dto/responses';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';
import { PortalMedicoRepository } from '../infrastructure/portal-medico.repository';

@Injectable()
export class GetProducaoUseCase {
  constructor(private readonly repo: PortalMedicoRepository) {}

  async execute(
    ctx: MedicoRequestContext,
    query: ProducaoQueryDto,
  ): Promise<ProducaoResponse> {
    const competencia = query.competencia ?? currentCompetencia();

    const [totais, porTipo, porFuncao] = await Promise.all([
      this.repo.findProducaoTotais({
        prestadorId: ctx.prestadorId,
        competencia,
      }),
      this.repo.findProducaoPorTipo({
        prestadorId: ctx.prestadorId,
        competencia,
      }),
      this.repo.findProducaoPorFuncao({
        prestadorId: ctx.prestadorId,
        competencia,
      }),
    ]);

    return {
      competencia,
      totalAtendimentos: totais.total_atendimentos,
      totalCirurgias: totais.total_cirurgias,
      totalLaudos: totais.total_laudos,
      porTipo,
      porFuncao,
    };
  }
}
