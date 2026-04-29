/**
 * LogoutAllUseCase — RN-SEG-05.
 *
 * Revoga TODAS as sessões ativas do usuário identificado pelo
 * access token (Bearer). Útil em "saiu do celular roubado" /
 * "trocou senha".
 *
 * Como o controller passa apenas o `usuarioId` (já validado pelo
 * JWT guard), não precisamos do refresh aqui.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface LogoutAllInput {
  usuarioId: bigint;
  tenantId: bigint;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

@Injectable()
export class LogoutAllUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: LogoutAllInput): Promise<{ revoked: number }> {
    const result = await this.prisma.sessaoAtiva.updateMany({
      where: { usuarioId: input.usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });

    await this.audit.record({
      event: 'auth.logout_all',
      tenantId: input.tenantId,
      usuarioId: input.usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { revoked: result.count },
    });

    return { revoked: result.count };
  }
}
