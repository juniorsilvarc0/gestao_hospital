/**
 * ChangePasswordUseCase — usuário autenticado troca a própria senha.
 *
 * Pré-requisitos:
 *   - Bearer access token válido (controller exige; aqui recebemos
 *     apenas usuarioId+tenantId).
 *   - Senha atual correta (constant-time verify).
 *   - Nova senha passa na policy (PwnedPasswordsService).
 *   - Nova ≠ atual (não basta trocar para o mesmo valor).
 *
 * Side effects:
 *   - Atualiza `senha_hash`, zera `precisa_trocar_senha`.
 *   - Revoga TODAS as sessões ativas (segurança — força re-login
 *     em outros dispositivos).
 *   - Audit `auth.password.changed`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import {
  CurrentPasswordMismatchError,
  PasswordReuseError,
} from '../domain/auth.errors';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../infrastructure/argon2-password-hasher';
import { PwnedPasswordsService } from '../infrastructure/pwned-passwords.guard';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface ChangePasswordInput {
  usuarioId: bigint;
  tenantId: bigint;
  senhaAtual: string;
  novaSenha: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly pwned: PwnedPasswordsService,
    private readonly audit: AuthAuditService,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    // RLS-aware: SELECT em `usuarios` precisa de SET LOCAL.
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${input.tenantId.toString()}'`,
      );
      return tx.usuario.findFirstOrThrow({
        where: { id: input.usuarioId, deletedAt: null },
        select: { senhaHash: true, email: true, nome: true },
      });
    });

    if (user.senhaHash === null) {
      throw new CurrentPasswordMismatchError();
    }
    const ok = await this.hasher.verify(user.senhaHash, input.senhaAtual);
    if (!ok) {
      throw new CurrentPasswordMismatchError();
    }

    const sameAsOld = await this.hasher.verify(user.senhaHash, input.novaSenha);
    if (sameAsOld) {
      throw new PasswordReuseError();
    }

    this.pwned.validate(input.novaSenha, {
      email: user.email,
      nome: user.nome,
    });

    const newHash = await this.hasher.hash(input.novaSenha);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${input.tenantId.toString()}'`,
      );
      await tx.usuario.update({
        where: { id: input.usuarioId },
        data: {
          senhaHash: newHash,
          precisaTrocarSenha: false,
        },
      });
      // Sessoes ativas: revoga tudo, força relogin.
      await tx.sessaoAtiva.updateMany({
        where: { usuarioId: input.usuarioId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
    });

    await this.audit.record({
      event: 'auth.password.changed',
      tenantId: input.tenantId,
      usuarioId: input.usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { method: 'self' },
    });
  }
}
