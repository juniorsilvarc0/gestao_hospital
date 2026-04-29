/**
 * ForgotPasswordUseCase — gera token de reset e envia por email.
 *
 * Comportamento sempre "200 OK" (anti enumeration): não revela se
 * o email existe ou não. Internamente, se o usuário não existe,
 * apenas registramos `auth.password.reset.requested` com `metadata`
 * `{ matched: false }` — controller responde 202.
 *
 * Token: UUID v4. Hash SHA-256 persistido em Redis com TTL de 30min.
 * Email enviado via mailhog em dev.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { PasswordResetTokenStore } from '../infrastructure/password-reset-token.store';
import { MailerService } from '../infrastructure/mailer.service';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface ForgotPasswordInput {
  tenantCode: string;
  email: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
  resetUrlBase?: string;
}

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenStore: PasswordResetTokenStore,
    private readonly mailer: MailerService,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { codigo: input.tenantCode },
      select: { id: true, ativo: true },
    });

    if (tenant === null || !tenant.ativo) {
      // Anti-enumeration: silently log + skip (response will be 202).
      await this.audit.record({
        event: 'auth.password.reset.requested',
        tenantId: null,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { matched: false, reason: 'tenant_not_found' },
      });
      return;
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenant.id.toString()}'`,
      );
      return tx.usuario.findFirst({
        where: {
          email: input.email.toLowerCase(),
          ativo: true,
          deletedAt: null,
        },
        select: { id: true, email: true },
      });
    });

    if (user === null) {
      await this.audit.record({
        event: 'auth.password.reset.requested',
        tenantId: tenant.id,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { matched: false },
      });
      return;
    }

    const token = await this.tokenStore.issue({
      tenantId: tenant.id,
      usuarioId: user.id,
    });

    try {
      await this.mailer.sendPasswordResetEmail({
        to: user.email,
        resetToken: token,
        ...(input.resetUrlBase !== undefined
          ? { resetUrlBase: input.resetUrlBase }
          : {}),
      });
    } catch (err) {
      // Não revela falha ao caller — mas registra para o operador.
      await this.audit.record({
        event: 'auth.password.reset.requested',
        tenantId: tenant.id,
        usuarioId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: {
          matched: true,
          mailFailed: true,
          err: err instanceof Error ? err.message : String(err),
        },
      });
      return;
    }

    await this.audit.record({
      event: 'auth.password.reset.requested',
      tenantId: tenant.id,
      usuarioId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { matched: true },
    });
  }
}
