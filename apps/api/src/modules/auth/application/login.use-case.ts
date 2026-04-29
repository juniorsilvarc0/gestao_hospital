/**
 * LoginUseCase — autentica e emite tokens.
 *
 * Fluxo (RN-SEG-03, RN-SEG-04):
 *   1. Valida lockout por IP (Redis).
 *   2. Resolve `tenant.codigo` → `tenantId` (tenants não tem RLS).
 *   3. `$transaction` com `SET LOCAL app.current_tenant_id` para
 *      bypassar a policy padrão de RLS no `findFirst` em `usuarios`.
 *   4. Valida user existe + ativo + não soft-deleted.
 *   5. Valida `bloqueado_ate`.
 *   6. Argon2 verify (constant-time).
 *   7. Em sucesso: emite tokens, persiste sessão, reseta lockout.
 *   8. Em falha: incrementa lockout, registra auditoria.
 *
 * Audit:
 *   - Sucesso → `auth.login.success`
 *   - Falha   → `auth.login.failure` (com `reason`)
 *   - Lock    → `auth.lockout.user` + `auth.lockout.ip`
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import {
  InvalidCredentialsError,
  IpLockedError,
  TenantNotFoundError,
  UserInactiveError,
  UserLockedError,
} from '../domain/auth.errors';
import {
  Argon2PasswordHasher,
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../infrastructure/argon2-password-hasher';
import { JoseJwtService, JWT_SERVICE, type JwtService } from '../infrastructure/jose-jwt-service';
import { LockoutService } from '../infrastructure/lockout.service';
import { AuthAuditService } from '../infrastructure/auth-audit.service';

export interface LoginInput {
  tenantCode: string;
  email: string;
  senha: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId?: string | undefined;
}

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  user: {
    id: string;
    uuid: string;
    email: string;
    nome: string;
    perfis: string[];
    precisaTrocarSenha: boolean;
    mfaHabilitado: boolean;
    tenantId: string;
  };
}

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(JWT_SERVICE) private readonly jwt: JwtService,
    private readonly lockout: LockoutService,
    private readonly audit: AuthAuditService,
  ) {}

  // Sobrecarga para DI quando o token simbólico não está sendo usado
  // (ex.: testes diretos com `new LoginUseCase(...)`).
  static withConcrete(
    prisma: PrismaService,
    hasher: Argon2PasswordHasher,
    jwt: JoseJwtService,
    lockout: LockoutService,
    audit: AuthAuditService,
  ): LoginUseCase {
    return new LoginUseCase(prisma, hasher, jwt, lockout, audit);
  }

  async execute(input: LoginInput): Promise<LoginOutput> {
    // 1. Lockout por IP — falha cedo sem tocar no DB.
    if (input.ip !== undefined && (await this.lockout.isIpLocked(input.ip))) {
      await this.audit.record({
        event: 'auth.lockout.ip',
        tenantId: null,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { reason: 'ip_already_locked' },
      });
      throw new IpLockedError();
    }

    // 2. Resolve tenant antes de qualquer coisa que precise de RLS.
    const tenant = await this.prisma.tenant.findUnique({
      where: { codigo: input.tenantCode },
      select: { id: true, ativo: true },
    });
    if (tenant === null || !tenant.ativo) {
      await this.recordIpFailureAndAudit(input, null, null, 'tenant_not_found');
      throw new TenantNotFoundError();
    }

    // 3. Transação RLS-aware.
    const lookup = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenant.id.toString()}'`,
      );
      const user = await tx.usuario.findFirst({
        where: {
          email: input.email.toLowerCase(),
          deletedAt: null,
        },
        include: {
          perfis: { include: { perfil: { select: { codigo: true } } } },
        },
      });
      return user;
    });

    if (lookup === null) {
      await this.recordIpFailureAndAudit(
        input,
        tenant.id,
        null,
        'user_not_found',
      );
      throw new InvalidCredentialsError();
    }

    if (!lookup.ativo) {
      await this.audit.record({
        event: 'auth.login.failure',
        tenantId: tenant.id,
        usuarioId: lookup.id,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { reason: 'user_inactive' },
      });
      throw new UserInactiveError();
    }

    if (lookup.bloqueadoAte !== null && lookup.bloqueadoAte > new Date()) {
      await this.audit.record({
        event: 'auth.login.failure',
        tenantId: tenant.id,
        usuarioId: lookup.id,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: { reason: 'user_locked' },
      });
      throw new UserLockedError(lookup.bloqueadoAte);
    }

    if (lookup.senhaHash === null) {
      await this.recordFailure(input, tenant.id, lookup.id, 'no_password_hash');
      throw new InvalidCredentialsError();
    }

    const ok = await this.hasher.verify(lookup.senhaHash, input.senha);
    if (!ok) {
      await this.recordFailure(input, tenant.id, lookup.id, 'invalid_password');
      throw new InvalidCredentialsError();
    }

    // 4. Sucesso — emite tokens, persiste sessão, reseta lockout.
    const perfis = lookup.perfis.map((p) => p.perfil.codigo);
    const tokens = await this.jwt.issueTokens({
      usuarioId: lookup.id,
      tenantId: tenant.id,
      perfis,
      mfa: false,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenant.id.toString()}'`,
      );
      await tx.sessaoAtiva.create({
        data: {
          usuarioId: lookup.id,
          refreshTokenHash: tokens.refreshTokenHash,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          expiraEm: tokens.refreshTokenExpiresAt,
        },
      });
      await tx.usuario.update({
        where: { id: lookup.id },
        data: {
          ultimoLoginEm: new Date(),
          ultimoLoginIp: input.ip ?? null,
          tentativasLogin: 0,
          bloqueadoAte: null,
        },
      });
    });

    await this.lockout.resetUser(lookup.id);
    if (input.ip !== undefined) {
      await this.lockout.resetIp(input.ip);
    }

    await this.audit.record({
      event: 'auth.login.success',
      tenantId: tenant.id,
      usuarioId: lookup.id,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { perfis },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokens.refreshTokenExpiresIn,
      user: {
        id: lookup.id.toString(),
        uuid: lookup.uuidExterno,
        email: lookup.email,
        nome: lookup.nome,
        perfis,
        precisaTrocarSenha: lookup.precisaTrocarSenha,
        mfaHabilitado: lookup.mfaHabilitado,
        tenantId: tenant.id.toString(),
      },
    };
  }

  /**
   * Registra falha de senha de usuário identificado:
   *   - INCR no contador do usuário (5/15min)
   *   - INCR no contador do IP (20/1h)
   *   - Atualiza `bloqueado_ate` se threshold do usuário foi atingido.
   *   - Audit log.
   */
  private async recordFailure(
    input: LoginInput,
    tenantId: bigint,
    usuarioId: bigint,
    reason: string,
  ): Promise<void> {
    const userResult = await this.lockout.registerUserFailure(usuarioId);
    let ipResult: Awaited<ReturnType<typeof this.lockout.registerIpFailure>> | null = null;
    if (input.ip !== undefined) {
      ipResult = await this.lockout.registerIpFailure(input.ip);
    }

    if (userResult.triggered && userResult.lockedUntil !== null) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_tenant_id = '${tenantId.toString()}'`,
          );
          await tx.usuario.update({
            where: { id: usuarioId },
            data: {
              bloqueadoAte: userResult.lockedUntil,
              tentativasLogin: { increment: 1 },
            },
          });
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          this.logger.warn(
            { code: err.code, usuarioId: usuarioId.toString() },
            'Failed to set bloqueado_ate (will retry next failure)',
          );
        } else {
          throw err;
        }
      }
      await this.audit.record({
        event: 'auth.lockout.user',
        tenantId,
        usuarioId,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: {
          attempts: userResult.attempts,
          lockedUntil: userResult.lockedUntil.toISOString(),
        },
      });
    }

    if (ipResult?.triggered === true) {
      await this.audit.record({
        event: 'auth.lockout.ip',
        tenantId,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: {
          attempts: ipResult.attempts,
          lockedUntil: ipResult.lockedUntil?.toISOString() ?? null,
        },
      });
    }

    await this.audit.record({
      event: 'auth.login.failure',
      tenantId,
      usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { reason },
    });
  }

  /**
   * Falha sem userId conhecido: ainda contamos no IP para mitigar
   * scan de emails (RN-SEG-03).
   */
  private async recordIpFailureAndAudit(
    input: LoginInput,
    tenantId: bigint | null,
    usuarioId: bigint | null,
    reason: string,
  ): Promise<void> {
    let ipResult: Awaited<ReturnType<typeof this.lockout.registerIpFailure>> | null = null;
    if (input.ip !== undefined) {
      ipResult = await this.lockout.registerIpFailure(input.ip);
    }
    if (ipResult?.triggered === true) {
      await this.audit.record({
        event: 'auth.lockout.ip',
        tenantId,
        usuarioId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        metadata: {
          attempts: ipResult.attempts,
          lockedUntil: ipResult.lockedUntil?.toISOString() ?? null,
        },
      });
    }
    await this.audit.record({
      event: 'auth.login.failure',
      tenantId,
      usuarioId,
      ip: input.ip,
      userAgent: input.userAgent,
      correlationId: input.correlationId,
      metadata: { reason },
    });
  }
}
