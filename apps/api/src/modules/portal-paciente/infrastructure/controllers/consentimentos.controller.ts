/**
 * `ConsentimentosController` — endpoints LGPD do paciente:
 *   - GET    /v1/portal/paciente/consentimentos
 *   - POST   /v1/portal/paciente/consentimentos
 *   - POST   /v1/portal/paciente/consentimentos/{uuid}/revogar
 *
 * Captura `ip_origem` e `user_agent` da `Request` para o aceite — o
 * service não tem acesso direto à request.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ListConsentimentosUseCase } from '../../application/consentimentos/list-consentimentos.use-case';
import { RegistrarConsentimentoUseCase } from '../../application/consentimentos/registrar-consentimento.use-case';
import { RevogarConsentimentoUseCase } from '../../application/consentimentos/revogar-consentimento.use-case';
import { RegistrarConsentimentoDto } from '../../dto/registrar-consentimento.dto';
import { RevogarConsentimentoDto } from '../../dto/revogar-consentimento.dto';
import type {
  PortalConsentimentoResponse,
  PortalConsentimentosListResponse,
} from '../../dto/responses';

@ApiTags('portal-paciente')
@ApiBearerAuth()
@Controller({ path: 'portal/paciente/consentimentos', version: '1' })
export class ConsentimentosController {
  constructor(
    private readonly listUC: ListConsentimentosUseCase,
    private readonly registrarUC: RegistrarConsentimentoUseCase,
    private readonly revogarUC: RevogarConsentimentoUseCase,
  ) {}

  @Get()
  @RequirePermission('lgpd_consent', 'read')
  @ApiOperation({ summary: 'Lista consentimentos LGPD do paciente.' })
  async list(): Promise<PortalConsentimentosListResponse> {
    return this.listUC.execute();
  }

  @Post()
  @RequirePermission('lgpd_consent', 'aceitar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registra aceite/recusa de termo. Idempotente por (paciente, finalidade, versaoTermo). 409 se já existe.',
  })
  async registrar(
    @Body() dto: RegistrarConsentimentoDto,
    @Req() req: Request,
  ): Promise<{ data: PortalConsentimentoResponse }> {
    const data = await this.registrarUC.execute({
      dto,
      ipOrigem: extractIp(req),
      userAgent: extractUserAgent(req),
    });
    return { data };
  }

  @Post(':uuid/revogar')
  @RequirePermission('lgpd_consent', 'revogar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoga consentimento (não deleta — RN-LGP-01). 409 se já revogado.',
  })
  async revogar(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: RevogarConsentimentoDto,
  ): Promise<{ data: PortalConsentimentoResponse }> {
    const data = await this.revogarUC.execute(uuid, dto);
    return { data };
  }
}

function extractIp(req: Request): string | null {
  // X-Forwarded-For pode ser CSV; pegamos o primeiro IP.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(',')[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return req.ip ?? null;
}

function extractUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string' && ua.length > 0) {
    // VARCHAR(500) — corta safe.
    return ua.slice(0, 500);
  }
  return null;
}
