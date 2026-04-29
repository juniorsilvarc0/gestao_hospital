/**
 * RefreshTokenUseCase — RN-SEG-04, RN-SEG-05.
 *
 * Refresh é OPACO (UUID v4). Persistido em `sessoes_ativas` apenas
 * pelo SHA-256.
 *
 * Rotação:
 *   - Cada uso EMITE novo refresh.
 *   - O anterior é marcado `revogada_em = now()`.
 *
 * Reuse detection:
 *   - Se o cliente apresentar um refresh JÁ revogado → ATAQUE.
 *     Revogamos TODA a árvore de sessões do usuário e auditamos.
 *
 * Por que `findMany` com `where: { refreshTokenHash, usuarioId? }`:
 *   - Hash é único na prática (collision SHA-256 ≈ 0). Mas como não
 *     há `unique`, usamos `findFirst` com filtro por hash + ordenação.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../domain/auth.errors';
import { Inject } from '@nestjs/common';
import { JWT_SERVICE, type JwtService } from '../infrastructure/jose-jwt-service';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface RefreshInput {
  refreshToken: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(JWT_SERVICE) private readonly jwt: JwtService,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: RefreshInput): Promise<RefreshOutput> {
    const tokenHash = this.jwt.hashRefreshToken(input.refreshToken);

    // Busca direta sem RLS — `sessoes_ativas` ainda não tem tenant_id
    // próprio (será denormalizado em fase futura). Isso é seguro: o
    // hash é praticamente impossível de adivinhar, e a leitura abaixo
    // só retorna a sessão correspondente exata.
    const sessao = await this.prisma.sessaoAtiva.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: {
        usuario: {
          include: {
            perfis: { include: { perfil: { select: { codigo: true } } } },
          },
        },
      },
    });

    if (sessao === null) {
      // Token desconhecido — pode ser truncado, fake, ou de uma sessão
      // que já caiu por TTL/cleanup.
      await this.audit.record({
        event: 'auth.login.failure',
        tenantId: null,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { reason: 'refresh_unknown' },
      });
      throw new InvalidRefreshTokenError();
    }

    // Reuse: token JÁ revogado → ataque. Revoga TUDO do usuário.
    if (sessao.revogadaEm !== null) {
      await this.revokeAllForUser(sessao.usuarioId, sessao.usuario.tenantId);
      await this.audit.record({
        event: 'auth.refresh.reuse_detected',
        tenantId: sessao.usuario.tenantId,
        usuarioId: sessao.usuarioId,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { sessaoId: sessao.id },
      });
      throw new RefreshTokenReuseError();
    }

    // Expirado.
    if (sessao.expiraEm <= new Date()) {
      throw new InvalidRefreshTokenError();
    }

    if (!sessao.usuario.ativo || sessao.usuario.deletedAt !== null) {
      throw new InvalidRefreshTokenError();
    }

    const perfis = sessao.usuario.perfis.map((p) => p.perfil.codigo);
    const newTokens = await this.jwt.issueTokens({
      usuarioId: sessao.usuarioId,
      tenantId: sessao.usuario.tenantId,
      perfis,
      mfa: false,
    });

    // Rotação atômica: revoga atual + cria nova.
    await this.prisma.$transaction(async (tx) => {
      await tx.sessaoAtiva.update({
        where: { id: sessao.id },
        data: { revogadaEm: new Date() },
      });
      await tx.sessaoAtiva.create({
        data: {
          usuarioId: sessao.usuarioId,
          refreshTokenHash: newTokens.refreshTokenHash,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          expiraEm: newTokens.refreshTokenExpiresAt,
        },
      });
    });

    await this.audit.record({
      event: 'auth.refresh.rotated',
      tenantId: sessao.usuario.tenantId,
      usuarioId: sessao.usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { previousSessaoId: sessao.id },
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      accessTokenExpiresIn: newTokens.accessTokenExpiresIn,
      refreshTokenExpiresIn: newTokens.refreshTokenExpiresIn,
    };
  }

  private async revokeAllForUser(
    usuarioId: bigint,
    _tenantId: bigint,
  ): Promise<void> {
    await this.prisma.sessaoAtiva.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });
  }
}
