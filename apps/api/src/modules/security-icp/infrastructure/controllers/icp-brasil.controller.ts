/**
 * `IcpBrasilController` — endpoints de validação de certificado
 * ICP-Brasil.
 *
 *   POST /v1/security/icp-brasil/validar
 *
 * Permissão: `lgpd:admin` (a validação é considerada operação de
 * compliance — quem opera precisa do mesmo nível que aprova exports
 * LGPD; em PR futuro pode-se introduzir `security:icp_validar`).
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ValidateCertificateUseCase } from '../../application/validate-certificate.use-case';
import { ValidateCertificateDto } from '../../dto/validate-certificate.dto';
import type { ValidateCertificateResponse } from '../../dto/responses';

@ApiTags('security-icp')
@ApiBearerAuth()
@Controller({ path: 'security/icp-brasil', version: '1' })
export class IcpBrasilController {
  constructor(private readonly useCase: ValidateCertificateUseCase) {}

  @Post('validar')
  @RequirePermission('lgpd', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Valida certificado ICP-Brasil (validade temporal + serialNumber). Não verifica revogação online.',
  })
  async validar(
    @Body() dto: ValidateCertificateDto,
  ): Promise<{ data: ValidateCertificateResponse }> {
    const data = await this.useCase.execute(dto.certData);
    return { data };
  }
}
