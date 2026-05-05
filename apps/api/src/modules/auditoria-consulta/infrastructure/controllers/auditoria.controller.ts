/**
 * `AuditoriaController` — endpoints `/v1/auditoria/*` para consulta
 * (read-only) das três trilhas de auditoria do HMS-BR:
 *
 *   - `/v1/auditoria/eventos`             → tabela `auditoria_eventos`
 *   - `/v1/auditoria/acessos-prontuario`  → tabela `acessos_prontuario`
 *   - `/v1/auditoria/security-events`     → tabela `audit_security_events`
 *
 * Cada uma exige permissão granular dedicada — `auditoria:read`,
 * `auditoria:acessos`, `auditoria:security` (esta última a mais
 * restrita).
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { ListAcessosProntuarioUseCase } from '../../application/list-acessos-prontuario.use-case';
import { ListEventosUseCase } from '../../application/list-eventos.use-case';
import { ListSecurityEventsUseCase } from '../../application/list-security-events.use-case';
import { ListAcessosQueryDto } from '../../dto/list-acessos-query.dto';
import { ListEventosQueryDto } from '../../dto/list-eventos-query.dto';
import { ListSecurityQueryDto } from '../../dto/list-security-query.dto';
import type {
  ListAcessosResponse,
  ListEventosResponse,
  ListSecurityResponse,
} from '../../dto/responses';

@ApiTags('auditoria')
@ApiBearerAuth()
@Controller({ path: 'auditoria', version: '1' })
export class AuditoriaController {
  constructor(
    private readonly listEventosUC: ListEventosUseCase,
    private readonly listAcessosUC: ListAcessosProntuarioUseCase,
    private readonly listSecurityUC: ListSecurityEventsUseCase,
  ) {}

  @Get('eventos')
  @RequirePermission('auditoria', 'read')
  @ApiOperation({
    summary:
      'Lista eventos da trilha `auditoria_eventos` (CRUD + lógicos), ' +
      'paginada e filtrável por tabela / finalidade / usuário / período.',
  })
  async listEventos(
    @Query() query: ListEventosQueryDto,
  ): Promise<ListEventosResponse> {
    return this.listEventosUC.execute(query);
  }

  @Get('acessos-prontuario')
  @RequirePermission('auditoria', 'acessos')
  @ApiOperation({
    summary:
      'Lista acessos a prontuário (`acessos_prontuario`). RN-LGP-01 — ' +
      'cada leitura PHI gera registro; aqui é o relatório de quem viu o quê.',
  })
  async listAcessos(
    @Query() query: ListAcessosQueryDto,
  ): Promise<ListAcessosResponse> {
    return this.listAcessosUC.execute(query);
  }

  @Get('security-events')
  @RequirePermission('auditoria', 'security')
  @ApiOperation({
    summary:
      'Lista eventos críticos de segurança (RN-SEG-06/07). ' +
      'Restrito a ADMIN/AUDITOR.',
  })
  async listSecurity(
    @Query() query: ListSecurityQueryDto,
  ): Promise<ListSecurityResponse> {
    return this.listSecurityUC.execute(query);
  }
}
