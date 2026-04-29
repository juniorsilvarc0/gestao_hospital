/**
 * ResetPasswordUseCase — consome token, troca senha.
 *
 * Token (UUID v4) é one-shot — o store deleta na consulta.
 * Se inválido/expirado → `InvalidResetTokenError`.
 *
 * Side effects:
 *   - Atualiza `senha_hash`, zera `precisa_trocar_senha` e
 *     `bloqueado_ate` (libera conta se estava bloqueada por
 *     tentativas).
 *   - Revoga TODAS as sessões ativas.
 *   - Audit `auth.password.reset.completed`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { InvalidResetTokenError } from '../domain/auth.errors';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../infrastructure/argon2-password-hasher';
import { PwnedPasswordsService } from '../infrastructure/pwned-passwords.guard';
import { PasswordResetTokenStore } from '../infrastructure/password-reset-token.store';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface ResetPasswordInput {
  token: string;
  novaSenha: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly pwned: PwnedPasswordsService,
    private readonly tokenStore: PasswordResetTokenStore,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const payload = await this.tokenStore.consume(input.token);
    if (payload === null) {
      throw new InvalidResetTokenError();
    }

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${payload.tenantId.toString()}'`,
      );
      return tx.usuario.findFirst({
        where: { id: payload.usuarioId, deletedAt: null },
        select: { email: true, nome: true, ativo: true },
      });
    });

    if (user === null || !user.ativo) {
      throw new InvalidResetTokenError();
    }

    this.pwned.validate(input.novaSenha, {
      email: user.email,
      nome: user.nome,
    });

    const newHash = await this.hasher.hash(input.novaSenha);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${payload.tenantId.toString()}'`,
      );
      await tx.usuario.update({
        where: { id: payload.usuarioId },
        data: {
          senhaHash: newHash,
          precisaTrocarSenha: false,
          bloqueadoAte: null,
          tentativasLogin: 0,
        },
      });
      await tx.sessaoAtiva.updateMany({
        where: { usuarioId: payload.usuarioId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
    });

    await this.audit.record({
      event: 'auth.password.reset.completed',
      tenantId: payload.tenantId,
      usuarioId: payload.usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: {},
    });
  }
}
