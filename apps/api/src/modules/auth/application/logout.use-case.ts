/**
 * LogoutUseCase — revoga o refresh atual.
 *
 * Não falha se o token já estava revogado/desconhecido (idempotente).
 * Sempre 204.
 */
import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { JWT_SERVICE, type JwtService } from '../infrastructure/jose-jwt-service';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface LogoutInput {
  refreshToken: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(JWT_SERVICE) private readonly jwt: JwtService,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const hash = this.jwt.hashRefreshToken(input.refreshToken);
    const sessao = await this.prisma.sessaoAtiva.findFirst({
      where: { refreshTokenHash: hash },
      include: { usuario: { select: { tenantId: true } } },
    });

    if (sessao === null) {
      return;
    }
    if (sessao.revogadaEm !== null) {
      return;
    }

    await this.prisma.sessaoAtiva.update({
      where: { id: sessao.id },
      data: { revogadaEm: new Date() },
    });

    await this.audit.record({
      event: 'auth.logout',
      tenantId: sessao.usuario.tenantId,
      usuarioId: sessao.usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { sessaoId: sessao.id },
    });
  }
}
