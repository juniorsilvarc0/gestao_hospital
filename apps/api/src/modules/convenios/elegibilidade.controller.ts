/**
 * `ElegibilidadeController` — endpoint manual para verificação de
 * elegibilidade (RN-ATE-02).
 *
 * Endpoint:
 *   POST /v1/elegibilidade/verificar         elegibilidade:verificar
 *   body: { pacienteUuid, convenioUuid, numeroCarteirinha, procedimentoUuid? }
 *   resp: { elegivel, fonte, detalhes?, consultadoEm, expiraEm }
 *
 * Útil para a recepção verificar **antes** de abrir o atendimento. O
 * mesmo serviço é chamado depois pelo `IniciarAtendimentoUseCase`
 * (Trilha A) — o cache (1h por carteirinha+procedimento) garante que
 * a segunda chamada não bate no webservice da operadora.
 *
 * Permissão: `elegibilidade:verificar` (já seedada na migration
 * `20260430221255_recepcao_base`).
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  VerificarElegibilidadeDto,
  type VerificarElegibilidadeResponse,
} from './dto/verificar-elegibilidade.dto';
import { VerificarElegibilidadeUseCase } from './application/verificar-elegibilidade.use-case';

@ApiTags('elegibilidade')
@ApiBearerAuth()
@Controller({ path: 'elegibilidade', version: '1' })
export class ElegibilidadeController {
  constructor(private readonly useCase: VerificarElegibilidadeUseCase) {}

  @Post('verificar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('elegibilidade', 'verificar')
  @ApiOperation({
    summary:
      'Verifica elegibilidade do paciente em um convênio. Webservice ' +
      'indisponível ⇒ fonte=MANUAL (não bloqueia o atendimento).',
  })
  async verificar(
    @Body() dto: VerificarElegibilidadeDto,
  ): Promise<{ data: VerificarElegibilidadeResponse }> {
    const result = await this.useCase.execute({
      pacienteUuid: dto.pacienteUuid,
      convenioUuid: dto.convenioUuid,
      numeroCarteirinha: dto.numeroCarteirinha,
      procedimentoUuid: dto.procedimentoUuid,
    });
    return { data: result };
  }
}
