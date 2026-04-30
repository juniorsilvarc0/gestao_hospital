/**
 * `PainelChamadaController` — endpoint HTTP para a recepção emitir
 * chamada de paciente para a TV.
 *
 * Endpoint:
 *   POST /v1/painel-chamada/chamar
 *     - permissão: `agendamentos:write` (recepção/admin).
 *     - body: { agendamentoUuid, setorUuid?, sala? }
 *     - efeito: emite `paciente.chamado` na room `setor:<uuid>` e
 *       grava auditoria.
 *
 * O endpoint NÃO retorna o payload completo emitido — só confirma o
 * setorUuid para o caller saber onde foi.
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ChamarPacienteDto } from './dto/chamar-paciente.dto';
import { PainelChamadaService } from './painel-chamada.service';

@ApiTags('painel-chamada')
@ApiBearerAuth()
@Controller({ path: 'painel-chamada', version: '1' })
export class PainelChamadaController {
  constructor(private readonly service: PainelChamadaService) {}

  @Post('chamar')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('agendamentos', 'write')
  @ApiOperation({
    summary:
      'Emite evento `paciente.chamado` para o setor (TV). Grava auditoria. ' +
      'Setor pode ser informado explicitamente ou derivado do recurso.',
  })
  async chamar(@Body() dto: ChamarPacienteDto): Promise<{ setorUuid: string }> {
    return this.service.chamar({
      agendamentoUuid: dto.agendamentoUuid,
      setorUuid: dto.setorUuid,
      sala: dto.sala,
    });
  }
}
